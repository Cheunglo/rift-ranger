const storageKey = 'rift-ranger.suit-color';
const defaultColor = 'Gray';
const palePulse = '#fff4df';
const plumPulse = '#47224f';

// Separate armor shades preserve its edges against the arena and the Aura glow.
const suits = {
  Gray:   { plate: '#d1cdf8', helmet: '#adabe4', arm: '#a3a4db', leg: '#8183bd', light: '#a6a7df', shade: '#5c578f', pulse: plumPulse },
  Red:    { plate: '#ef5362', helmet: '#ff7884', arm: '#ed6473', leg: '#bb394d', light: '#e66573', shade: '#86283a', pulse: palePulse },
  Blue:   { plate: '#4b89f8', helmet: '#77a6ff', arm: '#5c96fa', leg: '#345cc2', light: '#719dff', shade: '#324b94', pulse: palePulse },
  Green:  { plate: '#53c67c', helmet: '#80e49a', arm: '#62d18a', leg: '#31935c', light: '#6bd389', shade: '#246146', pulse: palePulse },
  Yellow: { plate: '#f5ce4d', helmet: '#ffe17b', arm: '#f7d262', leg: '#c9972d', light: '#f3ce67', shade: '#8c6529', pulse: plumPulse },
  Pink:   { plate: '#ef77c0', helmet: '#ffa0d6', arm: '#f287c9', leg: '#bb5094', light: '#e281c0', shade: '#86376d', pulse: palePulse },
  Black:  { plate: '#4c4e60', helmet: '#71758b', arm: '#575b70', leg: '#434558', light: '#696d83', shade: '#323547', pulse: palePulse },
  White:  { plate: '#fffaf4', helmet: '#fffdfc', arm: '#eee7e2', leg: '#bec2cb', light: '#e2e5ed', shade: '#818b9f', pulse: plumPulse },
};

/** Bind the start-menu picker, remembered preference, and active armour palette. */
export function createRangerColorPicker(select, swatch) {
  for (const color of Object.keys(suits)) select.add(new Option(color, color));

  let color = defaultColor;
  try {
    const saved = localStorage.getItem(storageKey);
    if (Object.hasOwn(suits, saved)) color = saved;
  } catch {
    // Private browsing or site settings can make storage unavailable.
  }

  select.value = color;
  /** Reflect the selected armour's main colour in the picker. */
  function paintSwatch() {
    swatch.style.backgroundColor = suits[color].plate;
  }
  paintSwatch();

  select.addEventListener('change', () => {
    color = Object.hasOwn(suits, select.value) ? select.value : defaultColor;
    paintSwatch();
    try {
      localStorage.setItem(storageKey, color);
    } catch {
      // The choice still applies for the current page.
    }
  });

  /** Read the current palette for the next combat frame. */
  return () => suits[color];
}
