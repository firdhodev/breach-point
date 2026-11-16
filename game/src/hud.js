// The DOM HUD: crosshair, hit marker, ammo/health/money, round score + timer,
// bomb/progress bars, kill feed, buy menu and the overlay screens. It never touches
// the simulation; main.js pushes state in and reads the play / buy callbacks out.

const $ = (id) => document.getElementById(id);

let hitTimer = 0;
let msgTimer = 0;
const cache = {};

function setText(id, value) {
  if (cache[id] === value) return;
  cache[id] = value;
  $(id).textContent = value;
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function money(value) {
  return `$${value}`;
}

export function createHud() {
  const els = {
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    ammo: $('ammo'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    health: document.querySelector('#health .hp'),
    armor: document.querySelector('#health .armor'),
    money: $('money'),
    scoreAtk: $('score-atk'),
    scoreDef: $('score-def'),
    timer: $('timer'),
    roundLabel: $('round-label'),
    teamLabel: $('team-label'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    killfeed: $('killfeed'),
    bomb: $('bomb'),
    bombText: $('bomb-text'),
    bombBar: $('bomb-bar'),
    progress: $('progress'),
    progressText: $('progress-text'),
    progressBar: $('progress-bar'),
    centerMsg: $('center-msg'),
    centerTitle: $('center-title'),
    centerSub: $('center-sub'),
    buyMenu: $('buy-menu'),
    buyMoney: $('buy-money'),
    buyList: $('buy-list'),
  };

  const api = {
    // --- combat readouts ---
    setHealth(hp, armor) {
      const hpText = String(Math.max(0, Math.round(hp)));
      if (cache.hp !== hpText) { cache.hp = hpText; els.health.textContent = hpText; }
      els.health.classList.toggle('low', hp <= 30);
      const arText = String(Math.max(0, Math.round(armor)));
      if (cache.armor !== arText) { cache.armor = arText; els.armor.textContent = arText; }
    },
    setAmmo(mag, reserve) {
      els.ammoMag.textContent = String(mag);
      els.ammoReserve.textContent = `/ ${reserve}`;
      els.ammo.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      els.weaponName.textContent = name;
    },
    setMoney(value) {
      const text = money(value);
      if (cache.money !== text) {
        cache.money = text;
        els.money.textContent = text;
      }
    },
    setCrosshair(spreadRad) {
      const px = Math.round(6 + spreadRad * 900);
      const arms = els.crosshair.querySelectorAll('i');
      arms[0].style.top = '0';
      arms[1].style.bottom = '0';
      arms[2].style.left = '0';
      arms[3].style.right = '0';
      arms[0].style.transform = `translateY(${-px + 6}px)`;
      arms[1].style.transform = `translateY(${px - 6}px)`;
      arms[2].style.transform = `translateX(${-px + 6}px)`;
      arms[3].style.transform = `translateX(${px - 6}px)`;
    },
    hitmarker(headshot, killed) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('head', !!headshot);
      const scale = killed ? 1.3 : 1;
      els.hitmarker.style.transform = `translate(-50%, -50%) rotate(45deg) scale(${scale})`;
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        els.hitmarker.classList.remove('on');
        els.hitmarker.classList.remove('head');
        els.hitmarker.style.transform = '';
      }, headshot ? 160 : 100);
    },

    // --- round frame ---
    setRound({ atkScore, defScore, timer, round, teamLabel }) {
      els.scoreAtk.textContent = String(atkScore);
      els.scoreDef.textContent = String(defScore);
      const t = fmtTime(timer);
      if (cache.timer !== t) {
        cache.timer = t;
        els.timer.textContent = t;
      }
      els.timer.classList.toggle('low', timer <= 10);
      const rt = `Round ${round}`;
      if (cache.round !== rt) { cache.round = rt; els.roundLabel.textContent = rt; }
      if (teamLabel && cache.team !== teamLabel) {
        cache.team = teamLabel;
        els.teamLabel.textContent = teamLabel;
      }
    },

    // --- bomb / objective ---
    setBomb({ visible, text, fraction }) {
      els.bomb.hidden = !visible;
      if (!visible) return;
      els.bombText.textContent = text;
      els.bombBar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    },
    setProgress({ visible, text, fraction }) {
      els.progress.hidden = !visible;
      if (!visible) return;
      els.progressText.textContent = text;
      els.progressBar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    },

    killFeed(killer, victim, weapon, headshot) {
      const row = document.createElement('div');
      row.textContent = `${killer}  ✕  ${victim}  ·  ${weapon}${headshot ? '  (headshot)' : ''}`;
      if (headshot) row.classList.add('head');
      els.killfeed.prepend(row);
      while (els.killfeed.children.length > 5) els.killfeed.removeChild(els.killfeed.lastChild);
      setTimeout(() => row.remove(), 6000);
    },

    centerMessage(title, sub, holdMs = 2200) {
      els.centerTitle.textContent = title;
      els.centerSub.textContent = sub || '';
      els.centerMsg.classList.add('on');
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => els.centerMsg.classList.remove('on'), holdMs);
    },

    // --- buy menu ---
    showBuy(visible) {
      els.buyMenu.hidden = !visible;
    },
    refreshBuy(economy, buyItems, onBuy) {
      els.buyMoney.textContent = money(economy.money);
      els.buyList.textContent = '';
      for (const item of buyItems) {
        const owned =
          (item.slot === 'primary' && economy.loadout.primary === item.id) ||
          (item.slot === 'grenade' && economy.loadout.grenades >= 1);
        const affordable = economy.money >= item.price;
        const li = document.createElement('li');
        li.className = owned || !affordable ? 'cant' : '';
        const left = document.createElement('span');
        left.textContent = `${item.name}${owned ? ' ✓' : ''}`;
        const right = document.createElement('span');
        right.innerHTML = '';
        right.textContent = `${money(item.price)}  `;
        const kbd = document.createElement('kbd');
        kbd.textContent = item.key;
        right.appendChild(kbd);
        li.appendChild(left);
        li.appendChild(right);
        if (!owned && affordable) {
          li.addEventListener('click', () => onBuy(item.id));
        }
        els.buyList.appendChild(li);
      }
    },

    // --- overlay screens ---
    showOverlay({ title, copy, action }) {
      els.overlayTitle.textContent = title;
      els.overlayCopy.textContent = copy;
      if (action) els.play.textContent = action;
      els.overlay.hidden = false;
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
    },
  };

  return api;
}