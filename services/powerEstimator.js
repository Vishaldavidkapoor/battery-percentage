import * as Battery from "expo-battery";

export default class PowerEstimator {
  constructor({
    capacityMah = 3000,
    voltage = 3.85,
    sampleIntervalMs = 10000,
    windowSize = 5,
    onUpdate,
  } = {}) {
    this.capacityMah = capacityMah;
    this.voltage = voltage;
    this.sampleIntervalMs = sampleIntervalMs;
    this.windowSize = windowSize;
    this.onUpdate = onUpdate;

    this.timer = null;
    this.lastLevel = null;
    this.lastTime = null;
    this.samples = [];
  }

  async sample() {
    try {
      const level = await Battery.getBatteryLevelAsync();
      const now = Date.now();

      if (this.lastLevel != null && this.lastTime != null) {
        const dtHours = (now - this.lastTime) / (1000 * 60 * 60);
        if (dtHours > 0) {
          const delta = level - this.lastLevel; // fraction (e.g. 0.02)
          // mAh per hour = delta_fraction * capacity_mAh / dt_hours
          const rate_mA = (delta * this.capacityMah) / dtHours;
          // watts = (mA * V) / 1000
          const watts = (rate_mA * this.voltage) / 1000;

          this.samples.push(watts);
          if (this.samples.length > this.windowSize) this.samples.shift();

          const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
          this.onUpdate && this.onUpdate(avg);
        }
      }

      this.lastLevel = level;
      this.lastTime = now;
    } catch (err) {
      // ignore sampling errors
    }
  }

  start() {
    if (this.timer) return;
    this.lastLevel = null;
    this.lastTime = null;
    this.samples = [];
    this.timer = setInterval(() => this.sample(), this.sampleIntervalMs);
    // immediate sample
    this.sample();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastLevel = null;
    this.lastTime = null;
    this.samples = [];
    this.onUpdate && this.onUpdate(null);
  }

  setCapacityMah(v) {
    this.capacityMah = v;
  }

  setVoltage(v) {
    this.voltage = v;
  }
}
