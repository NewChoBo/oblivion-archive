new Promise((resolve) => {
  const capture = window.__ARCHIVE_AUDIO__;
  capture.recorder.onstop = async () => {
    const context = new AudioContext(),
      decoded = await context.decodeAudioData(
        await new Blob(capture.chunks, { type: 'audio/webm' }).arrayBuffer(),
      );
    const samples = decoded.getChannelData(0),
      bytes = new ArrayBuffer(44 + samples.length * 2),
      view = new DataView(bytes);
    const text = (offset, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    text(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, decoded.sampleRate, true);
    view.setUint32(28, decoded.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let peak = 0,
      energy = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      peak = Math.max(peak, Math.abs(s));
      energy += s * s;
      view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    const events = window.__ROOM_DEMO__
      .snapshot()
      .weapon.audio.events.filter((e) => e.time >= capture.started)
      .map((e) => {
        const start = Math.max(
            0,
            Math.floor(((e.time - capture.started) / 1000 + (e.delay || 0)) * decoded.sampleRate),
          ),
          end = Math.min(samples.length, start + Math.round(0.12 * decoded.sampleRate));
        let power = 0,
          p = 0;
        for (let i = start; i < end; i++) {
          power += samples[i] * samples[i];
          p = Math.max(p, Math.abs(samples[i]));
        }
        return {
          ...e,
          offset: (e.time - capture.started) / 1000,
          outputRms: Math.sqrt(power / Math.max(1, end - start)),
          outputPeak: p,
        };
      });
    const reader = new FileReader();
    reader.onload = () => {
      context.close();
      resolve({
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        peak,
        rms: Math.sqrt(energy / samples.length),
        events,
        wav: reader.result.split(',')[1],
      });
    };
    reader.readAsDataURL(new Blob([bytes], { type: 'audio/wav' }));
  };
  capture.recorder.stop();
});
