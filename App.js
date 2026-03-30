import React, { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import * as Battery from "expo-battery";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SessionManager from "./services/sessionManager";
import PowerEstimator from "./services/powerEstimator";

export default function App() {
  const [batteryLevel, setBatteryLevel] = useState(0);
  const [batteryState, setBatteryState] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [, setRenderTick] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const sessionManagerRef = useRef(null);
  const powerEstimatorRef = useRef(null);
  const [estimatedPower, setEstimatedPower] = useState(null);

  // ---- Restore state + register listener ----
  useEffect(() => {
    (async () => {
      // load previously saved sessions from SessionManager

      const savedTheme = await AsyncStorage.getItem("darkMode");
      if (savedTheme) setDarkMode(savedTheme === "true");

      const state = await Battery.getBatteryStateAsync();
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(level);
      setBatteryState(state);

      // initialize session manager, load sessions and restore
      sessionManagerRef.current = new SessionManager({
        onSessionsUpdated: setSessions,
        onTick: () => setRenderTick(Date.now()),
      });
      await sessionManagerRef.current.loadSessions();
      await sessionManagerRef.current.restore(state, level);

      // initialize power estimator and start if charging
      powerEstimatorRef.current = new PowerEstimator({
        capacityMah: 3000,
        voltage: 3.85,
        sampleIntervalMs: 10000,
        windowSize: 4,
        onUpdate: (v) => setEstimatedPower(v),
      });
      if (state === Battery.BatteryState.CHARGING) powerEstimatorRef.current.start();
    })();

    const sub = Battery.addBatteryStateListener(async ({ batteryState }) => {
      setBatteryState(batteryState);
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(level);

      const mgr = sessionManagerRef.current;
      const estimator = powerEstimatorRef.current;
      if (
        (batteryState === Battery.BatteryState.CHARGING ||
          batteryState === Battery.BatteryState.FULL) &&
        !mgr?.getCurrent()
      ) {
        mgr && mgr.start(level);
        estimator && estimator.start();
      }

      if (
        mgr?.getCurrent() &&
        (batteryState === Battery.BatteryState.UNPLUGGED ||
          batteryState === Battery.BatteryState.FULL)
      ) {
        mgr && mgr.finish(level);
        powerEstimatorRef.current && powerEstimatorRef.current.stop();
      }
    });

    return () => {
      sub?.remove();
      sessionManagerRef.current?.cleanup();
      powerEstimatorRef.current && powerEstimatorRef.current.stop();
    };
  }, []);

  useEffect(() => {
    if (Math.round(batteryLevel * 100) === 100) sessionManagerRef.current?.finish(batteryLevel);
  }, [batteryLevel]);

  // ---- Timer for live updates ----
  // timer is handled inside SessionManager

  // ---- Session management (handled by SessionManager) ----
  const saveSession = async (level) => {
    await sessionManagerRef.current?.save(level);
  };

  const resetTimer = async () => {
    await sessionManagerRef.current?.reset();
    setRenderTick(0);
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

  // duration/percentage helpers moved into SessionManager

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
        <Text style={[styles.infoText, darkMode && styles.infoTextDark]}>
          Battery: {(batteryLevel * 100).toFixed(0)}%
        </Text>
        <Text style={[styles.infoText, darkMode && styles.infoTextDark]}>
          State: {" "}
          {batteryState === Battery.BatteryState.CHARGING
            ? "Charging"
            : batteryState === Battery.BatteryState.FULL
            ? "Full"
            : "Not Charging"}
        </Text>
        <Text style={[styles.infoText, darkMode && styles.infoTextDark]}>
          Current Session: {" "}
          {sessionManagerRef.current?.getCurrent()
            ? `${sessionManagerRef.current.getCurrentPercentageString(
                batteryLevel
              )} | ${sessionManagerRef.current.getCurrentDurationString()}`
            : "Not active"}
        </Text>

        <Text style={[styles.infoText, darkMode && styles.infoTextDark]}>
          Estimated Power: {estimatedPower ? `${estimatedPower.toFixed(2)} W` : "—"}
        </Text>

        <TouchableOpacity style={styles.themeButton} onPress={toggleDarkMode}>
          <Text style={styles.saveBtnText}>
            {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </Text>
        </TouchableOpacity>

        {sessionManagerRef.current?.getCurrent() && (
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => saveSession(batteryLevel)}
          >
            <Text style={styles.saveBtnText}>💾 Save Current Session</Text>
          </TouchableOpacity>
        )}
        
           <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => resetTimer()}
          >
            <Text style={styles.saveBtnText}> Reset Current Session</Text>
          </TouchableOpacity>
      </View>

      <Text style={[styles.subHeader, darkMode && { color: "#fff" }]}>
        Previous Sessions
      </Text>

      <FlatList
        data={sessions}
        renderItem={renderSession}
        keyExtractor={(item, index) => index.toString()}
        ListEmptyComponent={
          <Text style={[styles.sessionText, darkMode && styles.sessionTextDark]}>
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
    paddingVertical: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(102, 88, 85, 0.27)",
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
  sessionTextDark: {
    color: "#fff",
  },
  infoText: {
    fontSize: 20,
    color: "#000",
  },
  infoTextDark: {
    color: "#fff",
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
