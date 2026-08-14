/**
 * CIRCLE SURVIVAL - COMPETITIVE LEADERBOARD & STATS SYSTEM
 * Tier rankings (Apex, Grandmaster, Diamond, Gold), rival ghost leaderboards,
 * lifetime stats tracking, and LocalStorage persistence.
 */

class SurvivalLeaderboard {
  constructor() {
    this.playerName = localStorage.getItem('CIRCLE_SURVIVAL_PLAYER') || 'Pilot-' + Math.floor(1000 + Math.random() * 9000);
    this.stats = this.loadStats();
    this.board = this.loadBoard();
  }

  loadStats() {
    const raw = localStorage.getItem('CIRCLE_SURVIVAL_STATS');
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return {
      highScore: 0,
      bestTime: 0,
      totalRuns: 0,
      totalGrazes: 0,
      totalBlasts: 0,
      totalDashes: 0,
      totalVaporized: 0,
      totalTimeSurvived: 0
    };
  }

  saveStats() {
    localStorage.setItem('CIRCLE_SURVIVAL_STATS', JSON.stringify(this.stats));
  }

  loadBoard() {
    const raw = localStorage.getItem('CIRCLE_SURVIVAL_LEADERBOARD');
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    // Default competitive seeded leaderboard
    return [
      { name: "Vortex_Zero", score: 28450, time: "184.2s", grazes: 42, tier: "apex" },
      { name: "Kurogane_X", score: 24100, time: "156.8s", grazes: 38, tier: "apex" },
      { name: "Nova_Spectre", score: 21850, time: "142.1s", grazes: 31, tier: "apex" },
      { name: "Aegis_Pilot", score: 18900, time: "128.5s", grazes: 29, tier: "gm" },
      { name: "QuantumDrifter", score: 16750, time: "115.0s", grazes: 24, tier: "gm" },
      { name: "Hyperion99", score: 14200, time: "98.4s", grazes: 19, tier: "diamond" },
      { name: "Solaris_Rebel", score: 12800, time: "89.2s", grazes: 17, tier: "diamond" },
      { name: "ChronoVoid", score: 10450, time: "76.5s", grazes: 14, tier: "gold" },
      { name: "StarSurfer_07", score: 8600, time: "64.0s", grazes: 11, tier: "gold" },
      { name: "AstroRookie", score: 5400, time: "42.1s", grazes: 6, tier: "silver" }
    ];
  }

  saveBoard() {
    localStorage.setItem('CIRCLE_SURVIVAL_LEADERBOARD', JSON.stringify(this.board));
  }

  recordRun(score, time, grazes, blasts, dashes, vaporized) {
    this.stats.totalRuns++;
    this.stats.totalGrazes += grazes || 0;
    this.stats.totalBlasts += blasts || 0;
    this.stats.totalDashes += dashes || 0;
    this.stats.totalVaporized += vaporized || 0;
    this.stats.totalTimeSurvived += time || 0;

    const isNewPB = score > this.stats.highScore;
    if (isNewPB) {
      this.stats.highScore = score;
    }
    if (time > this.stats.bestTime) {
      this.stats.bestTime = time;
    }
    this.saveStats();

    // Insert into leaderboard if high enough
    let tier = "bronze";
    if (score >= 20000) tier = "apex";
    else if (score >= 15000) tier = "gm";
    else if (score >= 10000) tier = "diamond";
    else if (score >= 6000) tier = "gold";
    else if (score >= 3000) tier = "silver";

    this.board.push({
      name: this.playerName,
      score: score,
      time: `${time.toFixed(1)}s`,
      grazes: grazes || 0,
      tier: tier,
      isCurrent: true
    });

    this.board.sort((a, b) => b.score - a.score);
    this.board = this.board.slice(0, 15);
    this.saveBoard();

    return {
      rank: this.board.findIndex(e => e.isCurrent && e.score === score) + 1,
      isNewPB: isNewPB,
      tier: tier
    };
  }

  setPlayerName(name) {
    if (!name || !name.trim()) return;
    this.playerName = name.trim().slice(0, 16);
    localStorage.setItem('CIRCLE_SURVIVAL_PLAYER', this.playerName);
  }

  renderBoardHTML() {
    let rows = '';
    this.board.forEach((entry, idx) => {
      const rank = idx + 1;
      let badge = `<span class="rank-num">#${rank}</span>`;
      if (rank === 1) badge = `<span class="rank-num">1ST</span>`;
      else if (rank === 2) badge = `<span class="rank-num">2ND</span>`;
      else if (rank === 3) badge = `<span class="rank-num">3RD</span>`;

      const isMe = entry.name === this.playerName;
      const rowClass = isMe ? 'leaderboard-row current-player' : 'leaderboard-row';
      const tierBadge = `<span class="tier-tag tier-${entry.tier || 'bronze'}">${(entry.tier || 'bronze').toUpperCase()}</span>`;

      rows += `
        <div class="${rowClass}">
          <div class="lb-col lb-rank">${badge}</div>
          <div class="lb-col lb-name">${entry.name} ${tierBadge}</div>
          <div class="lb-col lb-time">${entry.time}</div>
          <div class="lb-col lb-grazes">${entry.grazes}</div>
          <div class="lb-col lb-score">${entry.score.toLocaleString()}</div>
        </div>
      `;
    });
    return rows;
  }
}

window.survivalLeaderboard = new SurvivalLeaderboard();
