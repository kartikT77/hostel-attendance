import React, { useEffect, useState, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const STORAGE_KEY = "hostel-attendance-data";
const NOTIF_ID_KEY = "hostel-attendance-notif-id";

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
function keyFor(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function todayKey() {
  const t = new Date();
  return keyFor(t.getFullYear(), t.getMonth(), t.getDate());
}
function formatKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [data, setData] = useState({}); // { "2026-08-18": { status: "present"|"absent", note: "" } }
  const [loaded, setLoaded] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  const [activeKey, setActiveKey] = useState(null); // day key currently open in the modal
  const [draftNote, setDraftNote] = useState("");

  // Load saved attendance from local device storage
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setData(JSON.parse(raw));
      } catch (e) {
        console.warn("Failed to load attendance", e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("Failed to save attendance", e);
    }
  }, []);

  const openDay = (y, m, d) => {
    const k = keyFor(y, m, d);
    setActiveKey(k);
    setDraftNote(data[k]?.note || "");
  };

  const closeModal = () => {
    setActiveKey(null);
    setDraftNote("");
  };

  const setStatus = (status) => {
    if (!activeKey) return;
    setData((prev) => {
      const next = { ...prev };
      next[activeKey] = { ...(prev[activeKey] || {}), status, note: draftNote };
      persist(next);
      return next;
    });
    closeModal();
  };

  const clearDay = () => {
    if (!activeKey) return;
    setData((prev) => {
      const next = { ...prev };
      delete next[activeKey];
      persist(next);
      return next;
    });
    closeModal();
  };

  const saveNoteOnly = () => {
    if (!activeKey) return;
    setData((prev) => {
      const next = { ...prev };
      if (prev[activeKey]) {
        next[activeKey] = { ...prev[activeKey], note: draftNote };
        persist(next);
      }
      return next;
    });
  };

  // Ask permission and schedule a real local daily 9 PM notification.
  useEffect(() => {
    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const existingId = await AsyncStorage.getItem(NOTIF_ID_KEY);
      if (existingId) return;

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Mark today's attendance",
          body: "Are you present in the hostel today?",
        },
        trigger: { hour: 21, minute: 0, repeats: true },
      });
      await AsyncStorage.setItem(NOTIF_ID_KEY, id);
    })();
  }, []);

  // Calendar grid math
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  let present = 0,
    absent = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const v = data[keyFor(viewYear, viewMonth, d)];
    if (v?.status === "present") present++;
    else if (v?.status === "absent") absent++;
  }
  const marked = present + absent;
  const pct = marked ? Math.round((present / marked) * 100) : 0;

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const isToday = (d) => keyFor(viewYear, viewMonth, d) === todayKey();
  const activeEntry = activeKey ? data[activeKey] : null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>HOSTEL LEDGER</Text>
          <Text style={styles.title}>
            {MONTH_NAMES[viewMonth]} <Text style={styles.titleYear}>{viewYear}</Text>
          </Text>
        </View>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setStatsOpen((o) => !o)}>
          <Text style={{ color: "#F0EFE6", fontSize: 18 }}>⋮</Text>
        </TouchableOpacity>
      </View>

      {statsOpen && (
        <View style={styles.statsCard}>
          <Text style={styles.statsHeading}>{MONTH_NAMES[viewMonth]} summary</Text>
          <StatRow label="Present" value={present} color="#6FA37C" />
          <StatRow label="Absent" value={absent} color="#C4695A" />
          <StatRow label="Unmarked" value={daysInMonth - marked} color="#8A8578" />
          <View style={styles.divider} />
          <View style={styles.statsRow}>
            <Text style={{ color: "#F0EFE6" }}>Attendance</Text>
            <Text style={{ color: "#F0EFE6", fontWeight: "700" }}>{pct}%</Text>
          </View>
        </View>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navBtn} onPress={goPrev}>
          <Text>{"‹"}</Text>
        </TouchableOpacity>
        <Text style={styles.navLabel}>{marked}/{daysInMonth} days marked</Text>
        <TouchableOpacity style={styles.navBtn} onPress={goNext}>
          <Text>{"›"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dayLabelRow}>
        {DAY_LABELS.map((l, i) => (
          <Text key={i} style={styles.dayLabel}>{l}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={styles.cell} />;
          const k = keyFor(viewYear, viewMonth, d);
          const entry = data[k];
          const status = entry?.status;
          const bg =
            status === "present" ? "#4C7A5E" : status === "absent" ? "#B4483A" : "#FFFFFF";
          const fg = status ? "#F5F3EA" : "#20241F";
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.cell,
                { backgroundColor: bg, borderColor: isToday(d) ? "#C79A4B" : "#DEDACB", borderWidth: isToday(d) ? 2 : 1 },
              ]}
              onPress={() => openDay(viewYear, viewMonth, d)}
            >
              <Text style={{ color: fg, fontWeight: isToday(d) ? "700" : "400" }}>{d}</Text>
              {entry?.note ? <View style={[styles.noteDot, { backgroundColor: status ? fg : "#C79A4B" }]} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        <LegendDot color="#4C7A5E" label="Present" />
        <LegendDot color="#B4483A" label="Absent" />
        <LegendDot color="#FFFFFF" border label="Unmarked" />
      </View>
      <Text style={styles.hint}>Tap a day to open it and choose Present, Absent, or add a note.</Text>
      {loaded && <Text style={styles.saved}>saved locally on this device</Text>}

      {/* Day detail modal */}
      <Modal visible={!!activeKey} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalDate}>{activeKey ? formatKey(activeKey) : ""}</Text>

            {activeEntry?.status && (
              <Text
                style={[
                  styles.currentStatus,
                  { color: activeEntry.status === "present" ? "#4C7A5E" : "#B4483A" },
                ]}
              >
                Currently marked {activeEntry.status}
              </Text>
            )}

            <Text style={styles.noteLabel}>Note (optional)</Text>
            <TextInput
              value={draftNote}
              onChangeText={setDraftNote}
              placeholder="e.g. left early for exam"
              placeholderTextColor="#B0AC9C"
              style={styles.noteInput}
              multiline
              onBlur={saveNoteOnly}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.presentBtn]} onPress={() => setStatus("present")}>
                <Text style={styles.modalBtnText}>Present</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.absentBtn]} onPress={() => setStatus("absent")}>
                <Text style={styles.modalBtnText}>Absent</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity onPress={clearDay}>
                <Text style={styles.footerLink}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={closeModal}>
                <Text style={styles.footerLink}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function StatRow({ label, value, color }) {
  return (
    <View style={styles.statsRow}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={{ color: "#F0EFE6" }}>{label}</Text>
      </View>
      <Text style={{ color: "#F0EFE6" }}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label, border }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16 }}>
      <View
        style={[
          styles.legendSwatch,
          { backgroundColor: color, borderWidth: border ? 1 : 0, borderColor: "#DEDACB" },
        ]}
      />
      <Text style={{ fontSize: 11, color: "#8A8578" }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F0EFE6", paddingHorizontal: 16, paddingTop: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  eyebrow: { fontSize: 11, letterSpacing: 2, color: "#8A8578" },
  title: { fontSize: 26, fontWeight: "700", color: "#20241F", marginTop: 2 },
  titleYear: { color: "#8A8578", fontWeight: "400" },
  menuBtn: {
    backgroundColor: "#20241F",
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statsCard: {
    backgroundColor: "#20241F",
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
  },
  statsHeading: { fontSize: 10, letterSpacing: 1, color: "#9C9788", marginBottom: 8, textTransform: "uppercase" },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  divider: { height: 1, backgroundColor: "#3A3F35", marginVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 10 },
  navBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DEDACB",
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { fontSize: 12, color: "#8A8578" },
  dayLabelRow: { flexDirection: "row" },
  dayLabel: { flex: 1, textAlign: "center", fontSize: 11, color: "#8A8578" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 3,
  },
  noteDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legendRow: { flexDirection: "row", marginTop: 16 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3, marginRight: 5 },
  hint: { fontSize: 11, color: "#B0AC9C", marginTop: 6 },
  saved: { fontSize: 10, color: "#C7C3B4", marginTop: 10, textAlign: "right" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(32,36,31,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 18,
  },
  modalDate: { fontSize: 18, fontWeight: "700", color: "#20241F" },
  currentStatus: { fontSize: 12, marginTop: 4, fontWeight: "600" },
  noteLabel: { fontSize: 11, color: "#8A8578", marginTop: 14, marginBottom: 6 },
  noteInput: {
    borderWidth: 1,
    borderColor: "#DEDACB",
    borderRadius: 8,
    padding: 10,
    minHeight: 60,
    textAlignVertical: "top",
    color: "#20241F",
    fontSize: 13,
  },
  modalBtnRow: { flexDirection: "row", marginTop: 16, gap: 10 },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  presentBtn: { backgroundColor: "#4C7A5E" },
  absentBtn: { backgroundColor: "#B4483A" },
  modalBtnText: { color: "#F5F3EA", fontWeight: "700" },
  modalFooterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  footerLink: { color: "#8A8578", fontSize: 13 },
});
