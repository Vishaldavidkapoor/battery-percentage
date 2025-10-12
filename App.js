import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Button,
} from "react-native";
import * as Battery from "expo-battery";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSIONS_KEY = "charging_sessions";

export default function App() {
  const [batteryLevel, setBatteryLevel] = useState(0);
  const [batteryState, setBatteryState] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [renderTick, setRenderTick] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const sessionRef = useRef(null);
  const timerRef = useRef(null);

  // ---- Restore state + register listener ----
  useEffect(() => {
    (async () => {
      const json = await AsyncStorage.getItem(SESSIONS_KEY);
      if (json) setSessions(JSON.parse(json));

      const savedTheme = await AsyncStorage.getItem("darkMode");
      if (savedTheme) setDarkMode(savedTheme === "true");

      const state = await Battery.getBatteryStateAsync();
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(level);
      setBatteryState(state);

      // Restore active session
      if (state === Battery.BatteryState.CHARGING) {
        const savedStart = await AsyncStorage.getItem("chargingStartTime");
        const savedLevel = await AsyncStorage.getItem("chargingStartLevel");
        if (savedStart && savedLevel) {
          sessionRef.current = {
            start: new Date(savedStart),
            levelAtStart: parseFloat(savedLevel),
          };
          startTimer();
        } else {
          startSession(level);
        }
      }
    })();

    const sub = Battery.addBatteryStateListener(async ({ batteryState }) => {
      setBatteryState(batteryState);
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(level);

      if (
        (batteryState === Battery.BatteryState.CHARGING ||
          batteryState === Battery.BatteryState.FULL) &&
        !sessionRef.current
      ) {
        startSession(level);
      }

      if (
        sessionRef.current &&
        (batteryState === Battery.BatteryState.UNPLUGGED ||
          batteryState === Battery.BatteryState.FULL)
      ) {
        finishSession(level);
      }
    });

    return () => sub?.remove();
  }, []);

  // ---- Timer for live updates ----
  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setRenderTick(Date.now()), 1000);
  };

  // ---- Session management ----
  const startSession = async (level) => {
    const start = new Date();
    sessionRef.current = { start, levelAtStart: level };
    await AsyncStorage.setItem("chargingStartTime", start.toISOString());
    await AsyncStorage.setItem("chargingStartLevel", level.toString());
    startTimer();
  };

  const finishSession = async (level) => {
    if (!sessionRef.current) return;
    const end = new Date();
    const { start, levelAtStart } = sessionRef.current;
    const duration = (end - start) / 1000 / 60; // in minutes

    const newSession = {
      start: start.toISOString(),
      end: end.toISOString(),
      duration,
      from: Math.round(levelAtStart * 100),
      to: Math.round(level * 100),
    };

    const updated = [newSession, ...sessions];
    setSessions(updated);
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));

    // Clear active session
    sessionRef.current = null;
    await AsyncStorage.removeItem("chargingStartTime");
    await AsyncStorage.removeItem("chargingStartLevel");

    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ---- UI helpers ----
  const renderSession = ({ item }) => (
    <View style={[styles.session, darkMode && { borderBottomColor: "#555" }]}>
      <Text style={[styles.sessionText, darkMode && { color: "#fff" }]}>
        {item.from}% → {item.to}% | {item.duration.toFixed(1)} min
      </Text>
      <Text style={[styles.sessionText, darkMode && { color: "#fff" }]}>
        {new Date(item.start).toLocaleTimeString()} →{" "}
        {new Date(item.end).toLocaleTimeString()}
      </Text>
    </View>
  );

  const getCurrentDuration = () => {
    if (!sessionRef.current) return "—";
    const diff = (Date.now() - new Date(sessionRef.current.start)) / 1000;
    return `${Math.floor(diff / 60)}m ${Math.floor(diff % 60)}s`;
  };

  const getCurrentPercentage = () => {
    if (!sessionRef.current) return "—";
    return `${Math.round(
      sessionRef.current.levelAtStart * 100
    )}% → ${Math.round(batteryLevel * 100)}%`;
  };

  const toggleDarkMode = async () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    await AsyncStorage.setItem("darkMode", newMode.toString());
  };

  return (
    <View style={[styles.container, darkMode && { backgroundColor: "#000" }]}>
      <Text style={[styles.header, darkMode && { color: "#fff" }]}>
        🔋 Charge Tracker
      </Text>

      <View style={styles.info}>
        <Text style={darkMode && { color: "#fff" }}>
          Battery: {(batteryLevel * 100).toFixed(0)}%
        </Text>
        <Text style={darkMode && { color: "#fff" }}>
          State:{" "}
          {batteryState === Battery.BatteryState.CHARGING
            ? "Charging"
            : batteryState === Battery.BatteryState.FULL
            ? "Full"
            : "Not Charging"}
        </Text>
        <Text style={darkMode && { color: "#fff" }}>
          Current Session:{" "}
          {sessionRef.current
            ? `${getCurrentPercentage()} | ${getCurrentDuration()}`
            : "Not active"}
        </Text>

        <TouchableOpacity style={styles.themeButton} onPress={toggleDarkMode}>
          <Text style={styles.saveBtnText}>
            {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </Text>
        </TouchableOpacity>

        {sessionRef.current && (
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => finishSession(batteryLevel)}
          >
            <Text style={styles.saveBtnText}>💾 Save Current Session</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.subHeader, darkMode && { color: "#fff" }]}>
        Previous Sessions
      </Text>

      <FlatList
        data={sessions}
        renderItem={renderSession}
        keyExtractor={(item, index) => index.toString()}
        ListEmptyComponent={
          <Text style={darkMode && { color: "#fff" }}>
            No previous sessions
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 20,
    paddingTop: 60,
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  info: {
    marginBottom: 30,
    alignItems: "center",
  },
  subHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  session: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  sessionText: {
    fontSize: 14,
    color: "#333",
  },
  saveBtn: {
    marginTop: 15,
    backgroundColor: "#2ecc71",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
  },
  themeButton: {
    marginTop: 15,
    backgroundColor: "#218dccff",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    width: "50%",
    alignSelf: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
