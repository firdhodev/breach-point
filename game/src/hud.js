const prices = { 'Morrow 5.56': 2700, 'Kestrel 9': 1800, 'Latch .45': 2250, 'Cinder grenade': 300 };

export function updateHud(s) {
  document.getElementById('health-value').textContent = s.health;
  document.getElementById('ammo-value').textContent = s.mag;
  document.getElementById('ammo-reserve').textContent = s.reserve;
  document.getElementById('timer-value').textContent = s.phaseTimer;
  document.getElementById('score-value').textContent = `${s.scoresA} - ${s.scoresB}`;
  document.getElementById('round-message').textContent = s.roundMessage ?? `Round ${s.round}`;
  document.getElementById('kill-feed').replaceChildren(...(s.killFeed || []).map(line => {
    const item = document.createElement('div'); item.textContent = line; return item;
  }));
  document.getElementById('buy-menu').hidden = s.phase !== 'buy';
}

export function renderBuyMenu(onBuy) {
  const menu = document.getElementById('buy-menu');
  const options = document.getElementById('buy-options');
  options.replaceChildren();
  for (const [name, price] of Object.entries(prices)) {
    const button = document.createElement('button');
    button.textContent = `${name} — $${price}`;
    button.addEventListener('click', () => onBuy(name));
    options.append(button);
  }
  menu.hidden = false;
}
