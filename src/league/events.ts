// Between-game front office events. Every choice changes something measurable.
import { clamp } from '../core/rng';
import { addNews, careerRng, playerMap, saveRng, teamPlayers, type Career, type PendingEvent } from './career';
import { fullName } from './players';
import { contractDemand } from './transactions';

function eventsEnabled(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem('gl-settings') || '{}');
    return s.randomEvents !== false;
  } catch {
    return true;
  }
}

export function maybeRandomEvent(c: Career) {
  if (c.event || !eventsEnabled()) return;
  const rng = careerRng(c);
  if (!rng.chance(0.38)) {
    saveRng(c, rng);
    return;
  }
  const pm = playerMap(c);
  const roster = teamPlayers(c, c.userTeam, pm);
  const starters = roster.filter((p) => !p.injury).sort((a, b) => b.ovr - a.ovr);
  const kinds = ['extension', 'media', 'charity', 'curfew', 'sponsor', 'film', 'rival', 'early_return'];
  rng.shuffle(kinds);
  for (const k of kinds) {
    const ev = build(c, k, starters, roster, rng.next());
    if (ev) {
      c.event = ev;
      break;
    }
  }
  saveRng(c, rng);
}

function build(c: Career, kind: string, starters: ReturnType<typeof teamPlayers>, roster: ReturnType<typeof teamPlayers>, r: number): PendingEvent | null {
  const lastBox = [...c.boxes].reverse().find((b) => b.userPlayed || b.home === c.userTeam || b.away === c.userTeam);
  const lost = lastBox ? (lastBox.home === c.userTeam ? lastBox.hs < lastBox.as : lastBox.as < lastBox.hs) : false;
  switch (kind) {
    case 'extension': {
      const p = starters.find((x) => x.ovr >= 76 && x.contract.years === 1 && x.age <= 31);
      if (!p) return null;
      const d = contractDemand(c, p, c.userTeam);
      return {
        id: kind, title: 'Extension Request',
        text: `${p.pos} ${fullName(p)} (${p.ovr} OVR) is entering the final year of his deal and wants an extension now: ${d.years} years at $${d.salary}M per year.`,
        choices: [
          { label: `Extend (${d.years} yrs, $${d.salary}M)`, effect: 'Contract signed now, player morale +15. Counts against the cap immediately.' },
          { label: 'Wait for the offseason', effect: 'Player morale -12. He may ask for more later.' },
        ],
        data: { pid: p.id, salary: d.salary, years: d.years },
      };
    }
    case 'media': {
      const qb = roster.filter((p) => p.pos === 'QB').sort((a, b) => b.ovr - a.ovr);
      if (!lost || qb.length < 2) return null;
      return {
        id: kind, title: 'Press Conference',
        text: `After the loss, reporters ask if ${fullName(qb[0])} is still your starting quarterback.`,
        choices: [
          { label: 'Back your starter', effect: 'Starting QB morale +10, fans -2.' },
          { label: 'Open the competition', effect: 'Starting QB morale -15, backup QB morale +10, team morale +2.' },
        ],
        data: { qb1: qb[0].id, qb2: qb[1].id },
      };
    }
    case 'charity':
      if (c.cc < 1) return null;
      return {
        id: kind, title: 'Community Event',
        text: 'The city is hosting a youth football clinic and asks the coaching staff to attend.',
        choices: [
          { label: 'Attend (-1 CC)', effect: 'Fan support +5.' },
          { label: 'Decline', effect: 'Fan support -1.' },
        ],
        data: {},
      };
    case 'curfew': {
      const p = starters[Math.floor(r * Math.min(10, starters.length))];
      if (!p) return null;
      return {
        id: kind, title: 'Missed Curfew',
        text: `${p.pos} ${fullName(p)} was spotted out well past team curfew before practice.`,
        choices: [
          { label: 'Suspend one game', effect: 'He misses the next game. Team morale +3.' },
          { label: 'Let it slide', effect: 'His morale +5, team morale -4.' },
        ],
        data: { pid: p.id },
      };
    }
    case 'sponsor':
      return {
        id: kind, title: 'Sponsorship Offer',
        text: 'A flashy energy drink company wants to plaster its logo across your practice facility.',
        choices: [
          { label: 'Accept (+$4M)', effect: 'Team cash +$4M, fan support -2.' },
          { label: 'Decline', effect: 'Fan support +1.' },
        ],
        data: {},
      };
    case 'film':
      if (c.cc < 1) return null;
      return {
        id: kind, title: 'Extra Film Sessions',
        text: 'Your coordinators want to run late-night film sessions this week.',
        choices: [
          { label: 'Approve (-1 CC)', effect: 'Every player gains development XP (+4).' },
          { label: 'Give them the night off', effect: 'Team morale +2.' },
        ],
        data: {},
      };
    case 'rival': {
      const next = c.schedule.find((g) => g.week === c.week && (g.home === c.userTeam || g.away === c.userTeam));
      if (!next) return null;
      const opp = c.teams[next.home === c.userTeam ? next.away : next.home];
      return {
        id: kind, title: 'Bulletin Board Material',
        text: `A ${opp.name} player called your team "soft" on a podcast this week.`,
        choices: [
          { label: 'Fire back publicly', effect: 'Team morale +4, fan support +1, coach reputation -1.' },
          { label: 'Take the high road', effect: 'Fan support +2, coach reputation +1.' },
        ],
        data: {},
      };
    }
    case 'early_return': {
      const p = roster.filter((x) => x.injury && x.injury.weeks >= 3 && x.injury.weeks < 10 && x.ovr >= 70)[0];
      if (!p || !p.injury) return null;
      return {
        id: kind, title: 'Early Return?',
        text: `${p.pos} ${fullName(p)} (${p.injury.desc}, ${p.injury.weeks} weeks left) says he feels ready to play.`,
        choices: [
          { label: 'Clear him early', effect: 'Injury time halved, but 30% chance of a setback (+3 weeks).' },
          { label: 'Stick to the plan', effect: 'His morale -5.' },
        ],
        data: { pid: p.id },
      };
    }
  }
  return null;
}

export function resolveEvent(c: Career, choice: number): string {
  const e = c.event;
  if (!e) return '';
  const pm = playerMap(c);
  const team = teamPlayers(c, c.userTeam, pm);
  const teamMorale = (d: number) => team.forEach((p) => (p.morale = clamp(p.morale + d, 0, 100)));
  const rng = careerRng(c);
  let msg = '';
  const p = e.data.pid ? pm.get(e.data.pid) : undefined;
  switch (e.id) {
    case 'extension':
      if (p && choice === 0) {
        p.contract = { salary: e.data.salary, years: e.data.years + 1 };
        p.morale = clamp(p.morale + 15, 0, 100);
        msg = `${fullName(p)} signed a ${e.data.years}-year extension.`;
      } else if (p) {
        p.morale = clamp(p.morale - 12, 0, 100);
        msg = `${fullName(p)} is unhappy about waiting.`;
      }
      break;
    case 'media': {
      const q1 = pm.get(e.data.qb1);
      const q2 = pm.get(e.data.qb2);
      if (choice === 0) {
        if (q1) q1.morale = clamp(q1.morale + 10, 0, 100);
        c.fans = clamp(c.fans - 2, 0, 100);
        msg = 'Your quarterback appreciates the vote of confidence.';
      } else {
        if (q1) q1.morale = clamp(q1.morale - 15, 0, 100);
        if (q2) q2.morale = clamp(q2.morale + 10, 0, 100);
        teamMorale(2);
        msg = 'The QB room is on notice.';
      }
      break;
    }
    case 'charity':
      if (choice === 0) {
        c.cc -= 1;
        c.fans = clamp(c.fans + 5, 0, 100);
        msg = 'The community loved it. Fan support is up.';
      } else {
        c.fans = clamp(c.fans - 1, 0, 100);
        msg = 'A few fans grumbled about the no-show.';
      }
      break;
    case 'curfew':
      if (p && choice === 0) {
        p.injury = { weeks: 1, desc: 'Suspended' };
        teamMorale(3);
        msg = `${fullName(p)} will sit out the next game.`;
      } else if (p) {
        p.morale = clamp(p.morale + 5, 0, 100);
        teamMorale(-4);
        msg = 'The locker room noticed the double standard.';
      }
      break;
    case 'sponsor':
      if (choice === 0) {
        c.cash += 4;
        c.seasonRevenue += 4;
        c.fans = clamp(c.fans - 2, 0, 100);
        msg = 'The check cleared. Fans are not thrilled with the neon.';
      } else {
        c.fans = clamp(c.fans + 1, 0, 100);
        msg = 'Fans appreciate the classic look.';
      }
      break;
    case 'film':
      if (choice === 0) {
        c.cc -= 1;
        team.forEach((pl) => (pl.xp += 4));
        msg = 'Long nights in the film room. Everyone is sharper.';
      } else {
        teamMorale(2);
        msg = 'The players enjoyed the night off.';
      }
      break;
    case 'rival':
      if (choice === 0) {
        teamMorale(4);
        c.fans = clamp(c.fans + 1, 0, 100);
        c.coach.reputation = clamp(c.coach.reputation - 1, 0, 100);
        msg = 'Your players are fired up.';
      } else {
        c.fans = clamp(c.fans + 2, 0, 100);
        c.coach.reputation = clamp(c.coach.reputation + 1, 0, 100);
        msg = 'Class act. The media praised your composure.';
      }
      break;
    case 'early_return':
      if (p && p.injury && choice === 0) {
        p.injury.weeks = Math.max(1, Math.ceil(p.injury.weeks / 2));
        if (rng.chance(0.3)) {
          p.injury.weeks += 3;
          msg = `${fullName(p)} suffered a setback in practice.`;
        } else msg = `${fullName(p)} is ahead of schedule.`;
      } else if (p) {
        p.morale = clamp(p.morale - 5, 0, 100);
        msg = `${fullName(p)} is frustrated but healthy.`;
      }
      break;
  }
  saveRng(c, rng);
  c.event = null;
  if (msg) addNews(c, msg);
  return msg;
}
