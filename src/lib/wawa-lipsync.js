// src/lib/wawa-lipsync.js
// Port JS do pacote "wawa-lipsync" (versão simplificada) com o mesmo
// algoritmo de features, histórico e detecção de viseme.

export const VISEMES = {
  sil: "viseme_sil",
  PP:  "viseme_PP",
  FF:  "viseme_FF",
  TH:  "viseme_TH",
  DD:  "viseme_DD",
  kk:  "viseme_kk",
  CH:  "viseme_CH",
  SS:  "viseme_SS",
  nn:  "viseme_nn",
  RR:  "viseme_RR",
  aa:  "viseme_aa",
  E:   "viseme_E",
  I:   "viseme_I",
  O:   "viseme_O",
  U:   "viseme_U",
};

const FSMStates = {
  silence:  "silence",
  vowel:    "vowel",
  plosive:  "plosive",
  fricative:"fricative",
};

const VISEMES_STATES = {
  [VISEMES.sil]: FSMStates.silence,
  [VISEMES.PP]:  FSMStates.plosive,
  [VISEMES.FF]:  FSMStates.fricative,
  [VISEMES.TH]:  FSMStates.fricative,
  [VISEMES.DD]:  FSMStates.plosive,
  [VISEMES.kk]:  FSMStates.plosive,
  [VISEMES.CH]:  FSMStates.fricative,
  [VISEMES.SS]:  FSMStates.fricative,
  [VISEMES.nn]:  FSMStates.plosive,
  [VISEMES.RR]:  FSMStates.fricative,
  [VISEMES.aa]:  FSMStates.vowel,
  [VISEMES.E]:   FSMStates.vowel,
  [VISEMES.I]:   FSMStates.vowel,
  [VISEMES.O]:   FSMStates.vowel,
  [VISEMES.U]:   FSMStates.vowel,
};

function average(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export class Lipsync {
  constructor(params = {}) {
    const {
      fftSize = 1024,   // menor fft => menos latência
      historySize = 8,  // janelinha curta p/ reagir rápido
      smoothing = 0.5,  // filtro do Analyser
    } = params;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = Ctx ? new Ctx() : null;

    this.analyser = this.audioContext?.createAnalyser();
    if (this.analyser) {
      this.analyser.fftSize = fftSize;
      this.analyser.smoothingTimeConstant = smoothing;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    } else {
      this.dataArray = new Uint8Array(0);
    }

    this.history = [];
    this.historySize = historySize;

    this.sampleRate = this.audioContext ? this.audioContext.sampleRate : 48000;
    this.binWidth   = this.sampleRate / (this.analyser?.fftSize || fftSize);

    // Bandas em Hz
    this.bands = [
      { start: 50,   end: 200  }, // energia grave
      { start: 200,  end: 400  }, // F1 lower
      { start: 400,  end: 800  }, // F1 mid
      { start: 800,  end: 1500 }, // F2 front
      { start: 1500, end: 2500 }, // F2/F3
      { start: 2500, end: 4000 }, // fricativas
      { start: 4000, end: 8000 }, // fricativas altas
    ];

    this.features = null;  // último frame
    this.viseme   = VISEMES.sil;
    this.state    = FSMStates.silence;

    // extras úteis
    this.volume   = 0;     // volume médio instantâneo
    this.audioEl  = null;
    this.sourceNode = null;
  }

  connectAudio(audio) {
    if (!this.audioContext || !this.analyser) return;

    // evita reconectar o mesmo <audio>
    if (this.audioEl === audio && this.sourceNode) return;
    this.audioEl = audio;

    // createMediaElementSource só pode ser criado 1x por elemento
    try {
      this.sourceNode = this.audioContext.createMediaElementSource(audio);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    } catch (e) {
      // se já foi criado antes, só garante a cadeia
      try { this.analyser.connect(this.audioContext.destination); } catch {}
    }

    // reset estado
    this.audioContext.resume?.();
    this.history = [];
    this.features = null;
    this.state = FSMStates.silence;
    this.viseme = VISEMES.sil;
    this.volume = 0;
  }

  async connectMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia || !this.audioContext) return null;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mic = this.audioContext.createMediaStreamSource(stream);
    mic.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    return mic;
  }

  extractFeatures() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.dataArray);

    const bandEnergies = this.bands.map(({ start, end }) => {
      const startBin = Math.round(start / this.binWidth);
      const endBin   = Math.min(Math.round(end / this.binWidth), this.dataArray.length - 1);
      const slice    = this.dataArray.slice(startBin, endBin);
      return average(Array.from(slice)) / 255;
    });

    // centroid
    let sumAmp = 0, weighted = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const freq = i * this.binWidth;
      const amp  = this.dataArray[i] / 255;
      sumAmp += amp;
      weighted += freq * amp;
    }
    const centroid = sumAmp > 0 ? weighted / sumAmp : 0;

    const volume = average(bandEnergies);
    this.volume = volume;

    const previous = this.history[this.history.length - 1];
    const deltaBands = bandEnergies.map((energy, idx) => {
      if (!previous) return 0;
      return energy - previous.bands[idx];
    });

    const features = { bands: bandEnergies, deltaBands, volume, centroid };

    // só empilha no histórico quando há som
    if (sumAmp > 0) {
      this.history.push(features);
      if (this.history.length > this.historySize) this.history.shift();
    }
    this.features = features;
    return features;
  }

  getAveragedFeatures() {
    const len = this.history.length || 1;
    const sum = { volume: 0, centroid: 0, bands: Array(this.bands.length).fill(0) };
    for (const f of this.history) {
      sum.volume += f.volume;
      sum.centroid += f.centroid;
      f.bands.forEach((b, i) => sum.bands[i] += b);
    }
    const bands = sum.bands.map((b) => b / len);
    return { volume: sum.volume / len, centroid: sum.centroid / len, bands, deltaBands: bands };
  }

  computeVisemeScores(current, avg, dVolume, dCentroid) {
    const scores = Object.fromEntries(Object.values(VISEMES).map(v => [v, 0]));

    const b7 = current.bands[6];

    // silêncio
    if (avg.volume < 0.2 && current.volume < 0.2) {
      scores[VISEMES.sil] = 1.0;
    }

    // plosivas
    Object.entries(VISEMES_STATES).forEach(([v, st]) => {
      if (st === FSMStates.plosive) {
        if (dVolume < 0.01) scores[v] -= 0.5;
        if (avg.volume < 0.2) scores[v] += 0.2;
        if (dCentroid > 1000) scores[v] += 0.2;
      }
    });

    if (current.centroid > 1000 && current.centroid < 8000) {
      if (current.centroid > 7000) {
        scores[VISEMES.DD] += 0.6;
      } else if (current.centroid > 5000) {
        scores[VISEMES.kk] += 0.6;
      } else if (current.centroid > 4000) {
        scores[VISEMES.PP] += 1;
        if (b7 > 0.25 && current.centroid < 6000) scores[VISEMES.DD] += 1.4;
      } else {
        scores[VISEMES.nn] += 0.6;
      }
    }

    // fricativas
    if (dCentroid > 1000 && current.centroid > 6000 && avg.centroid > 5000) {
      if (current.bands[6] > 0.4 && avg.bands[6] > 0.3) {
        scores[VISEMES.FF] = 0.7;
      }
    }

    // vogais (F1/F2)
    if (avg.volume > 0.1 && avg.centroid < 6000 && current.centroid < 6000) {
      const [b1, b2, b3, b4, b5] = avg.bands;
      const gapB1B2 = Math.abs(b1 - b2);
      const maxGapB2B3B4 = Math.max(Math.abs(b2 - b3), Math.abs(b2 - b4), Math.abs(b3 - b4));

      if (b3 > 0.1 || b4 > 0.1) {
        if (b4 > b3) {
          scores[VISEMES.aa] = 0.8;
          if (b3 > b2) scores[VISEMES.aa] += 0.2;
        }
        if (b3 > b2 && b3 > b4) scores[VISEMES.I] = 0.7;
        if (gapB1B2 < 0.25) scores[VISEMES.U] = 0.7;
        if (maxGapB2B3B4 < 0.25) scores[VISEMES.O] = 0.9;
        if (b2 > b3 && b3 > b4) scores[VISEMES.E] = 1;
        if (b3 < 0.2 && b4 > 0.3) scores[VISEMES.I] = 0.7;
        if (b3 > 0.25 && b5 > 0.25) scores[VISEMES.O] = 0.7;
        if (b3 < 0.15 && b5 < 0.15) scores[VISEMES.U] = 0.7;
      }
    }

    return scores;
  }

  adjustScoresForConsistency(scores) {
    const adjusted = { ...scores };
    if (this.viseme && this.state) {
      Object.keys(adjusted).forEach((v) => {
        if (v === this.viseme) adjusted[v] *= 1.3; // hysteresis
      });
    }
    return adjusted;
  }

  detectState() {
    const current = this.history[this.history.length - 1];
    if (!current) {
      this.state = FSMStates.silence;
      this.viseme = VISEMES.sil;
      return;
    }
    const avg = this.getAveragedFeatures();
    const dVolume = current.volume - avg.volume;
    const dCentroid = current.centroid - avg.centroid;

    const visemeScores = this.computeVisemeScores(current, avg, dVolume, dCentroid);
    const adjusted = this.adjustScoresForConsistency(visemeScores);

    let max = -Infinity, top = VISEMES.sil;
    for (const v of Object.values(VISEMES)) {
      if (adjusted[v] > max) { max = adjusted[v]; top = v; }
    }

    this.state = VISEMES_STATES[top] || FSMStates.silence;
    this.viseme = top;
  }

  processAudio() {
    this.extractFeatures();
    this.detectState();
  }
}