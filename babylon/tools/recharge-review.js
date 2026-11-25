(() => {
  const state = () => window.__ROOM_DEMO__.snapshot();
  const start = state().weapon,
    samples = [];
  const canvas = document.getElementById('game');
  let frame = null,
    raf = 0,
    largestReachGap = 0,
    largestNockGap = 0;
  function record() {
    const s = state(),
      w = s.weapon;
    if (w.id === start.id && (w.recharge.phase || w.recharge.completionGlow > 0)) {
      samples.push({
        phase: w.recharge.phase,
        progress: w.reloadProgress,
        ammo: w.ammo,
        shots: w.shots,
        complete: w.recharge.completionGlow,
        light: w.recharge.light,
      });
      if (s.viewMode === 'third' && w.reloadProgress > 0.28 && w.reloadProgress < 0.8) {
        const freeIsRight = (w.id === 'blaster-j') === (w.dominantHand === 'right');
        const [x, y, z] = s.player.hands[Number(freeIsRight)],
          [bx, , bz] = s.position;
        const px = bx + x * Math.cos(s.yaw) + z * Math.sin(s.yaw),
          py = s.player.rigOriginY + y,
          pz = bz - x * Math.sin(s.yaw) + z * Math.cos(s.yaw);
        const gap = ([gx, gy, gz]) => Math.hypot(px - gx, py - gy, pz - gz);
        largestReachGap = Math.max(largestReachGap, gap(w.recharge.markWorld));
        if (w.recharge.nockWorld && w.reloadProgress > 0.74)
          largestNockGap = Math.max(largestNockGap, gap(w.recharge.nockWorld));
      }
      if (!frame && w.reloadProgress >= 0.42 && w.reloadProgress < 0.68)
        frame = canvas.toDataURL('image/webp', 0.88).split(',')[1];
    }
    raf = requestAnimationFrame(record);
  }
  raf = requestAnimationFrame(record);
  window.__rechargeReview = {
    frame: () => frame,
    finish() {
      cancelAnimationFrame(raf);
      const w = state().weapon;
      const unrefilledAmmo = (sample) => start.ammo - (sample.shots - start.shots);
      return {
        tool: w.id,
        view: w.perspective,
        hand: w.dominantHand,
        initial: start.ammo,
        final: w.ammo,
        phases: [...new Set(samples.filter((x) => x.phase).map((x) => x.phase))],
        earlyRefill: samples.some((x) => x.phase && x.ammo !== unrefilledAmmo(x)),
        fired: w.shots - start.shots,
        peakLight: Math.max(0, ...samples.map((x) => x.light)),
        refilledOnFlash: samples.some((x) => x.complete > 0 && x.ammo > unrefilledAmmo(x)),
        samples: samples.length,
        largestReachGap: w.perspective === 'third' ? largestReachGap : null,
        largestNockGap: w.perspective === 'third' && w.id === 'blaster-j' ? largestNockGap : null,
        audio: w.audio.events
          .filter((e) => e.type.startsWith('reload-'))
          .slice(-3)
          .map((e) => e.type),
      };
    },
  };
  return true;
})();
