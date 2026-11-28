import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listen } from '../controls.mjs';

/** Build a controllable audio input and detector clock for synthetic samples. */
function microphone(sampleRate) {
  let input;
  let now = 0;
  const analyser = {
    /** Satisfy the analyser connection interface without live audio. */
    connect() {},
    /** Fill the analyser buffer from the current synthetic signal. */
    getFloatTimeDomainData(samples) {
      const recentWindow = 2 ** Math.ceil(Math.log2(sampleRate * .064));
      for (let i = 0; i < samples.length; i++) {
        const relative = i - samples.length + recentWindow;
        samples[i] = input(relative / sampleRate, relative);
      }
    },
  };
  const read = listen({
    sampleRate,
    /** Return the analyser backed by synthetic samples. */
    createAnalyser: () => analyser,
    /** Provide the muted sink used to keep the analyser connected. */
    createGain: () => ({
      gain: { value: 1 },
      /** Accept the outgoing connection without opening audio output. */
      connect() {},
    }),
    /** Provide the stand-in source on the input side of the graph. */
    createMediaStreamSource: () => ({
      /** Accept the analyser connection without opening a media device. */
      connect() {},
    }),
  }, {});
  /** Poll once with the supplied signal, then advance the detector clock. */
  return (signal = () => 0, suppress = false, elapsed = 20) => {
    input = signal;
    const result = read(now, suppress);
    now += elapsed;
    return result;
  };
}

/** Create a sine-wave sample generator for a sustained pitch. */
const hum = (hz, volume) => time => volume * Math.sin(2 * Math.PI * hz * time);

for (const rate of [44100, 48000]) {
  test(`quiet sound can change from a hum to a whistle at ${rate} Hz without resetting Aura input`, () => {
    const read = microphone(rate);
    for (let i = 0; i < 22; i++) read();
    assert.equal(read(hum(95, .0018)).state, 'sustaining');
    for (let i = 0; i < 6; i++) assert.equal(read(hum(i % 2 ? 1350 : 95, .0018)).humming, false);
    assert.equal(read(hum(1350, .0018)).humming, true);
    for (let i = 0; i < 5; i++) assert.equal(read().humming, true);
    for (let i = 0; i < 4; i++) read();
    assert.equal(read().humming, false);
  });
}

test('slower mic polling still recognizes a continuous sound', () => {
  const read = microphone(48000);
  for (let i = 0; i < 8; i++) read(undefined, false, 75);
  assert.equal(read(hum(120, .002), false, 75).humming, false);
  assert.equal(read(hum(120, .002), false, 75).humming, false);
  assert.equal(read(hum(120, .002), false, 250).humming, true);
  assert.equal(read(hum(120, .002), false, 250).humming, true);
  assert.equal(read(undefined, false, 250).humming, false);
});

test('steady background noise is ignored but sustained new sound can charge Aura', () => {
  const read = microphone(48000);
  let seed = 25;
  /** Create a repeatable background noise generator. */
  const noise = volume => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0x100000000 - .5) * volume;
  };
  const room = noise(.008);
  for (let i = 0; i < 50; i++) assert.equal(read(room).humming, false);
  const foreground = noise(.04);
  for (let i = 0; i < 7; i++) assert.equal(read(foreground).humming, false);
  assert.equal(read(foreground).humming, true);
});

test('clap fires once without charging and a held hum can resume after a beam', () => {
  const read = microphone(48000);
  for (let i = 0; i < 22; i++) read();
  /** Generate a short sharp peak in the microphone buffer. */
  const clap = (time, index) => index > 3500 && index < 3510 ? .8 : 0;
  assert.equal(read(clap).fireLaser, true);
  assert.equal(read(clap).fireLaser, false);
  for (let i = 0; i < 31; i++) assert.equal(read(hum(130, .005), true).humming, false);
  let result;
  for (let i = 0; i < 9; i++) result = read(hum(130, .005));
  assert.equal(result.humming, true);
});

test('a quiet tongue-click shape fires once when it is above the room level', () => {
  const read = microphone(48000);
  for (let i = 0; i < 22; i++) read();
  /** Generate a quiet alternating transient like a tongue click. */
  const click = (_, index) => index >= 3300 && index < 3312 ? (index % 2 ? .065 : -.065) : 0;
  assert.equal(read(click).fireLaser, true);
  assert.equal(read(click).fireLaser, false);
});

test('a short voiced burst and loud sustained singing do not fire Laser', () => {
  const read = microphone(48000);
  for (let i = 0; i < 22; i++) read();
  /** Generate sustained loud sound to distinguish it from a brief firing cue. */
  const shout = time => time > -.105 && time < -.005 ? .1 * Math.sin(time * 2 * Math.PI * 150) : 0;
  assert.equal(read(shout).fireLaser, false);
  let result;
  for (let i = 0; i < 25; i++) {
    result = read(hum(260, .085));
    assert.equal(result.fireLaser, false);
  }
  assert.equal(result.humming, true);
  assert.equal(read().fireLaser, false);
});

test('firing cues are ignored during the beam', () => {
  const read = microphone(48000);
  for (let i = 0; i < 22; i++) read();
  /** Generate an isolated peak during a suppressed interval. */
  const peak = (_, index) => index > 3500 && index < 3510 ? .8 : 0;
  assert.equal(read(peak, true).fireLaser, false);
  assert.equal(read().fireLaser, false);
});

test('audio history catches a click that ended between render frames', () => {
  const read = microphone(48000);
  for (let i = 0; i < 22; i++) read();
  /** Generate a transient at a fixed sample index for the calibration case. */
  const click = (_, index) => index >= -900 && index < -888 ? (index % 2 ? .08 : -.08) : 0;
  assert.equal(read(click).fireLaser, true);
  assert.equal(read(click).fireLaser, false);
});
