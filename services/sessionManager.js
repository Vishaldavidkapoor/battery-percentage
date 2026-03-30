import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Battery from "expo-battery";

const SESSIONS_KEY = "charging_sessions";

export default class SessionManager {
  constructor({ onSessionsUpdated, onTick } = {}) {
    this.onSessionsUpdated = onSessionsUpdated;
    this.onTick = onTick;
    this.session = null;
    this.timer = null;
  }

  async restore(state, level) {
    const savedStart = await AsyncStorage.getItem("chargingStartTime");
    const savedLevel = await AsyncStorage.getItem("chargingStartLevel");
    if (savedStart && savedLevel) {
      this.session = {
        start: new Date(savedStart),
        levelAtStart: parseFloat(savedLevel),
      };
      if (state === Battery.BatteryState.CHARGING) {
        this.startTimer();
      } else {
        await this.finish(level);
      }
    } else if (state === Battery.BatteryState.CHARGING) {
      await this.start(level);
    }
  }

  async loadSessions() {
    const json = await AsyncStorage.getItem(SESSIONS_KEY);
    const prev = json ? JSON.parse(json) : [];
    this.onSessionsUpdated && this.onSessionsUpdated(prev);
    return prev;
  }

  startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => this.onTick && this.onTick(), 1000);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async start(level) {
    const start = new Date();
    this.session = { start, levelAtStart: level };
    await AsyncStorage.setItem("chargingStartTime", start.toISOString());
    await AsyncStorage.setItem("chargingStartLevel", level.toString());
    this.startTimer();
  }

  async finish(level) {
    if (!this.session) return;
    const end = new Date();
    const { start, levelAtStart } = this.session;
    const duration = (end - start) / 1000 / 60; // minutes

    const newSession = {
      start: start.toISOString(),
      end: end.toISOString(),
      duration,
      from: Math.round(levelAtStart * 100),
      to: Math.round(level * 100),
    };

    const json = await AsyncStorage.getItem(SESSIONS_KEY);
    const prev = json ? JSON.parse(json) : [];
    const updated = [newSession, ...prev];
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    this.onSessionsUpdated && this.onSessionsUpdated(updated);

    this.session = null;
    await AsyncStorage.removeItem("chargingStartTime");
    await AsyncStorage.removeItem("chargingStartLevel");
    this.stopTimer();
  }

  async save(level) {
    if (!this.session) return;
    const end = new Date();
    const { start, levelAtStart } = this.session;
    const duration = (end - start) / 1000 / 60; // minutes

    const newSession = {
      start: start.toISOString(),
      end: end.toISOString(),
      duration,
      from: Math.round(levelAtStart * 100),
      to: Math.round(level * 100),
    };

    const json = await AsyncStorage.getItem(SESSIONS_KEY);
    const prev = json ? JSON.parse(json) : [];
    const updated = [newSession, ...prev];
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    this.onSessionsUpdated && this.onSessionsUpdated(updated);
  }

  async reset() {
    this.stopTimer();
    this.session = null;
    await AsyncStorage.removeItem("chargingStartTime");
    await AsyncStorage.removeItem("chargingStartLevel");
  }

  getCurrent() {
    return this.session;
  }

  getCurrentDurationString() {
    if (!this.session) return "—";
    const diff = (Date.now() - new Date(this.session.start)) / 1000;
    return `${Math.floor(diff / 60)}m ${Math.floor(diff % 60)}s`;
  }

  getCurrentPercentageString(batteryLevel) {
    if (!this.session) return "—";
    return `${Math.round(this.session.levelAtStart * 100)}% → ${Math.round(
      batteryLevel * 100
    )}%`;
  }

  cleanup() {
    this.stopTimer();
    this.session = null;
  }
}
