export type ImpactSurface = 'wood' | 'stone' | 'metal' | 'ink';

interface AudioEvent {
  type: string;
  time: number;
  tool?: string;
  surface?: ImpactSurface;
  power?: number;
  duration?: number;
  delay?: number;
  scheduled?: boolean;
  muted?: boolean;
}

// The same Web Audio mix drives speakers and the gameplay recording.
export function createWeaponAudio({
  onPlay,
  onError,
}: {
  onPlay: () => void;
  onError: (error: unknown) => void;
}) {
  const events: AudioEvent[] = [];
  const signals = new Set<AudioScheduledSourceNode>(),
    chargeNodes = new Set<AudioScheduledSourceNode>();
  let context: AudioContext,
    master: GainNode,
    shotBus: GainNode,
    recording: MediaStreamAudioDestinationNode;
  let drawVoice: { gate: GainNode; voices: OscillatorNode[] } | null = null;
  let muted = false,
    collectCharge = false,
    chargeTool = '';
  function note(type: string, details: Omit<AudioEvent, 'time' | 'type'> = {}) {
    events.push({ type, time: performance.now(), ...details });
    if (events.length > 120) events.shift();
  }
  function prepareGraph() {
    if (context) return;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    shotBus = context.createGain();
    shotBus.connect(master);
    master.connect(context.destination);
  }

  async function prepare() {
    try {
      prepareGraph();
      if (context.state === 'running') await context.suspend();
    } catch (error) {
      onError(error);
    }
  }

  function unlock() {
    try {
      prepareGraph();
      context.resume().catch(onError);
    } catch (error) {
      onError(error);
    }
  }
  function duckShots() {
    if (!context) return;
    const now = context.currentTime;
    shotBus.gain.cancelScheduledValues(now);
    shotBus.gain.setValueAtTime(shotBus.gain.value, now);
    shotBus.gain.linearRampToValueAtTime(0.08, now + 0.02);
  }
  function track(node: AudioScheduledSourceNode) {
    signals.add(node);
    if (collectCharge) chargeNodes.add(node);
    node.onended = () => {
      signals.delete(node);
      chargeNodes.delete(node);
    };
  }
  function oscillator(
    type: OscillatorType,
    start: number,
    duration: number,
    from: number,
    to: number,
    level: number,
    bus = master,
    attack = 0.006,
  ) {
    const node = context.createOscillator(),
      gain = context.createGain();
    node.type = type;
    node.frequency.setValueAtTime(from, start);
    node.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    node.connect(gain);
    gain.connect(bus);
    node.start(start);
    node.stop(start + duration + 0.01);
    track(node);
  }
  function noise(start: number, duration: number, level: number, frequency: number, bus = master) {
    const buffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * duration),
        context.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.18));
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.5;
    gain.gain.value = level;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start(start);
    track(source);
  }
  function cancelReload() {
    if (chargeNodes.size) note('reload-cancel', { tool: chargeTool });
    for (const node of chargeNodes) {
      try {
        node.stop();
      } catch {}
      signals.delete(node);
    }
    chargeNodes.clear();
  }
  function reloadStart(id: string, duration: number) {
    cancelReload();
    duckShots();
    if (muted || !context || context.state !== 'running') return;
    chargeTool = id;
    const wait = 0.025,
      start = context.currentTime + wait;
    collectCharge = true;
    oscillator('sine', start, 0.08, 980, 1000, 0.009);
    oscillator('sine', start + 0.025, 0.09, 1960, 2000, 0.004);
    oscillator('sine', start + 0.14, duration * 0.66, 320, 760, 0.012);
    noise(start + 0.14, 0.2, 0.01, 1100);
    collectCharge = false;
    note('reload-start', { tool: id, delay: wait, duration });
    note('reload-charge', { tool: id, delay: wait + 0.14, scheduled: true });
    onPlay();
  }
  function reloadComplete(id: string) {
    if (muted || !context || context.state !== 'running') return;
    const start = context.currentTime;
    collectCharge = true;
    oscillator('sine', start, 0.1, 1360, 1390, 0.014);
    oscillator('sine', start + 0.008, 0.08, 2040, 2080, 0.006);
    collectCharge = false;
    note('reload-complete', { tool: id, duration: 0.108 });
    onPlay();
  }
  function beginDraw(power: number, seconds: number) {
    if (drawVoice || muted || !context) return;
    const now = context.currentTime,
      remaining = Math.max(0.012, (1 - power) * seconds);
    const gain = context.createGain(),
      gate = context.createGain(),
      voices = [];
    gain.connect(gate);
    gate.connect(master);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.034 + 0.032 * power, now + 0.025);
    gain.gain.linearRampToValueAtTime(0.077, now + remaining + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.029, now + remaining + 0.34);
    for (const [type, ratio, volume] of [
      ['sine', 1, 1],
      ['triangle', 2.006, 0.24],
    ] as const) {
      const osc = context.createOscillator(),
        level = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(175 * Math.pow(440 / 175, power) * ratio, now);
      osc.frequency.exponentialRampToValueAtTime(440 * ratio, now + remaining);
      level.gain.value = volume;
      osc.connect(level);
      level.connect(gain);
      osc.start(now);
      voices.push(osc);
    }
    drawVoice = { gate, voices };
    note('bow-draw', { power });
    onPlay();
  }
  function endDraw() {
    if (!drawVoice) return;
    const { gate, voices } = drawVoice,
      now = context.currentTime;
    drawVoice = null;
    gate.gain.setValueAtTime(1, now);
    gate.gain.linearRampToValueAtTime(0, now + 0.016);
    for (const osc of voices) osc.stop(now + 0.018);
    voices[0]!.onended = () => gate.disconnect();
    note('bow-draw-end');
  }
  function castStroke() {
    if (muted || !context) return;
    const now = context.currentTime;
    noise(now, 0.085, 0.058, 1750);
    oscillator('sine', now, 0.088, 365, 680, 0.033);
    note('wand-stroke');
    onPlay();
  }
  function release(tool: string, power = 0) {
    if (tool === 'blaster-j') endDraw();
    if (muted || !context) return;
    const now = context.currentTime;
    shotBus.gain.cancelScheduledValues(now);
    shotBus.gain.setValueAtTime(1, now);
    if (tool === 'blaster-j') {
      // A short downward pluck leaves space for the next rising draw.
      oscillator(
        'triangle',
        now,
        0.105 + 0.055 * power,
        570 + 145 * power,
        148 - 24 * power,
        0.095 + 0.064 * power,
        shotBus,
      );
      oscillator('sine', now + 0.004, 0.16, 292 + 58 * power, 129, 0.053 + 0.033 * power, shotBus);
      noise(now, 0.047, 0.095 + 0.055 * power, 2200, shotBus);
    } else {
      oscillator('sine', now, 0.19, 742, 696, 0.075, shotBus);
      oscillator('sine', now + 0.018, 0.23, 1113, 1044, 0.039, shotBus);
      noise(now, 0.065, 0.032, 2900, shotBus);
    }
    note('shot', { tool, power });
    onPlay();
  }
  function impact(tool: string, surface: ImpactSurface, power: number, distance: number) {
    if (muted || !context) return;
    const now = context.currentTime,
      level = (tool === 'blaster-j' ? 0.074 + 0.046 * power : 0.066) / (1 + 0.14 * distance);
    const tone = { wood: 148, stone: 610, metal: 1690, ink: 95 }[surface];
    noise(now, surface === 'ink' ? 0.16 : 0.075, level * 1.4, Math.max(450, tone * 2));
    oscillator(
      surface === 'wood' ? 'triangle' : 'sine',
      now,
      surface === 'metal' ? 0.23 : 0.12,
      tone,
      tone * (surface === 'ink' ? 0.56 : 0.89),
      level,
    );
    if (tool === 'blaster-a') oscillator('sine', now + 0.022, 0.16, 1400, 1320, level * 0.52);
    note('impact', { tool, surface });
    onPlay();
  }
  function nockStart() {
    if (muted || !context || context.state !== 'running') return;
    const now = context.currentTime;
    chargeTool = 'blaster-j';
    collectCharge = true;
    noise(now + 0.18, 0.12, 0.025, 1150);
    noise(now + 0.24, 0.065, 0.016, 1900);
    collectCharge = false;
    note('bow-quiver');
    onPlay();
  }
  function nockComplete() {
    if (muted || !context || context.state !== 'running') return;
    const now = context.currentTime;
    oscillator('triangle', now, 0.065, 490, 308, 0.023);
    noise(now, 0.04, 0.015, 2100);
    note('bow-nock');
    onPlay();
  }
  function voidRumble(duration: number) {
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    oscillator('sine', now, duration, 58, 41, 0.037, master, 3.2);
    oscillator('triangle', now + 0.25, duration - 0.25, 89, 61, 0.014, master, 2.7);
    note('void-rumble', { duration });
    onPlay();
  }
  function firearm(automatic: boolean) {
    if (muted || context?.state !== 'running') return;
    const start = context.currentTime;
    noise(start, 0.12, automatic ? 0.13 : 0.16, automatic ? 1300 : 1850, shotBus);
    oscillator('triangle', start, 0.08, 154, 64, 0.055, shotBus);
  }
  function firearmReload() {
    if (muted || context?.state !== 'running') return;
    const start = context.currentTime;
    noise(start, 0.09, 0.062, 1800);
    noise(start + 0.24, 0.085, 0.041, 2300);
  }
  return {
    firearm,
    firearmReload,
    prepare,
    unlock,
    beginDraw,
    endDraw,
    castStroke,
    release,
    impact,
    nockStart,
    nockComplete,
    voidRumble,
    reloadStart,
    reloadComplete,
    cancelReload,
    stopAll() {
      endDraw();
      cancelReload();
      for (const node of signals) {
        try {
          node.stop();
        } catch {}
      }
      signals.clear();
    },
    pause() {
      endDraw();
      context?.suspend().catch(onError);
    },
    setMuted(value: boolean) {
      muted = value;
      if (value) endDraw();
      if (master) master.gain.value = muted ? 0 : 1;
      note('mute', { muted });
    },
    stream() {
      if (!context) return null;
      if (!recording) {
        recording = context.createMediaStreamDestination();
        master.connect(recording);
      }
      return recording.stream;
    },
    snapshot: () => ({
      muted,
      state: context?.state || 'not-started',
      drawing: !!drawVoice,
      activeChargeNodes: chargeNodes.size,
      events: [...events],
    }),
  };
}
