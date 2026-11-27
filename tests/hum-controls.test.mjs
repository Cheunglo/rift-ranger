import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listen } from '../controls.mjs';

function microphone(sampleRate) {
  let input;
  let now = 0;
  const analyser = {
    connect() {},
    getFloatTimeDomainData(samples) {
      for (let i = 0; i < samples.length; i++) samples[i] = input(i / sampleRate, i);
    },
  };
  const read = listen({
    sampleRate,
    createAnalyser: () => analyser,
    createGain: () => ({ gain: { value: 1 }, connect() {} }),
    createMediaStreamSource: () => ({ connect() {} }),
  }, {});
  return (signal = () => 0, suppress = false, elapsed = 20) => {
    input = signal;
    const result = read(now, suppress);
    now += elapsed;
    return result;
  };
}

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
  const clap = (time, index) => index > 3500 && index < 3510 ? .8 : 0;
  assert.equal(read(clap).clap, true);
  assert.equal(read(clap).clap, false);
  for (let i = 0; i < 31; i++) assert.equal(read(hum(130, .005), true).humming, false);
  let result;
  for (let i = 0; i < 9; i++) result = read(hum(130, .005));
  assert.equal(result.humming, true);
});
