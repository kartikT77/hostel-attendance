import React, { useCallback, useEffect, useState } from "react";
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
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const STORAGE_KEY = "hostel-attendance-data";
const NOTIFICATION_ID_KEY = "hostel-attendance-notification-id";

function pad(number) {
  return number < 10 ? `0${number}` : `${number}`;
}

function keyFor(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function todayKey() {
  const date = new Date();

  return keyFor(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function formatKey(key) {
  const [year, month, day] = key.split("-").map(Number);

  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
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

  const [data, setData] = useState({});
  const [loaded, setLoaded] = useState(false);

  const [statsOpen, setStatsOpen] = useState(false);

  const [activeKey, setActiveKey] = useState(null);
  const [draftNote, setDraftNote] = useState("");

  /*
   * Load attendance data
   */
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedData = await AsyncStorage.getItem(STORAGE_KEY);

        if (savedData) {
          const parsedData = JSON.parse(savedData);

          if (parsedData && typeof parsedData === "object") {
            setData(parsedData);
          }
        }
      } catch (error) {
        console.warn("Failed to load attendance:", error);
      } finally {
        setLoaded(true);
      }
    };

    loadData();
  }, []);

  /*
   * Save attendance data
   */
  const persist = useCallback(async (nextData) => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(nextData)
      );
    } catch (error) {
      console.warn("Failed to save attendance:", error);
    }
  }, []);

  /*
   * Open a calendar day
   */
  const openDay = (year, month, day) => {
    const key = keyFor(year, month, day);

    setActiveKey(key);
    setDraftNote(data[key]?.note || "");
  };

  /*
   * Close day modal
   */
  const closeModal = () => {
    setActiveKey(null);
    setDraftNote("");
  };

  /*
   * Mark present or absent
   */
  const setStatus = (status) => {
    if (!activeKey) {
      return;
    }

    setData((previousData) => {
      const nextData = {
        ...previousData,
        [activeKey]: {
          ...(previousData[activeKey] || {}),
          status,
          note: draftNote.trim(),
        },
      };

      persist(nextData);

      return nextData;
    });

    closeModal();
  };

  /*
   * Clear a day's attendance
   */
  const clearDay = () => {
    if (!activeKey) {
      return;
    }

    setData((previousData) => {
      const nextData = { ...previousData };

      delete nextData[activeKey];

      persist(nextData);

      return nextData;
    });

    closeModal();
  };

  /*
   * Save only the note
   */
  const saveNoteOnly = () => {
    if (!activeKey) {
      return;
    }

    setData((previousData) => {
      if (!previousData[activeKey]) {
        return previousData;
      }

      const nextData = {
        ...previousData,
        [activeKey]: {
          ...previousData[activeKey],
          note: draftNote.trim(),
        },
      };

      persist(nextData);

      return nextData;
    });
  };

  /*
   * Configure Android notification channel
   */
  useEffect(() => {
    const setupNotifications = async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Attendance reminders",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const permission =
          await Notifications.getPermissionsAsync();

        let finalStatus = permission.status;

        if (finalStatus !== "granted") {
          const requested =
            await Notifications.requestPermissionsAsync();

          finalStatus = requested.status;
        }

        if (finalStatus !== "granted") {
          return;
        }

        const existingNotificationId =
          await AsyncStorage.getItem(NOTIFICATION_ID_KEY);

        if (existingNotificationId) {
          return;
        }

        const notificationId =
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Mark today's attendance",
              body: "Are you present in the hostel today?",
            },
            trigger: {
              hour: 21,
              minute: 0,
              repeats: true,
            },
          });

        await AsyncStorage.setItem(
          NOTIFICATION_ID_KEY,
          notificationId
        );
      } catch (error) {
        console.warn(
          "Notification setup failed:",
          error
        );
      }
    };

    setupNotifications();
  }, []);

  /*
   * Calendar calculations
   */
  const firstDayOfMonth = new Date(
    viewYear,
    viewMonth,
    1
  ).getDay();

  const daysInMonth = new Date(
    viewYear,
    viewMonth + 1,
    0
  ).getDate();

  const cells = [];

  for (let i = 0; i < firstDayOfMonth; i++) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(day);
  }

  /*
   * Monthly statistics
   */
  let present = 0;
  let absent = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const key = keyFor(
      viewYear,
      viewMonth,
      day
    );

    const entry = data[key];

    if (entry?.status === "present") {
      present++;
    } else if (entry?.status === "absent") {
      absent++;
    }
  }

  const marked = present + absent;

  const unmarked = Math.max(
    daysInMonth - marked,
    0
  );

  const attendancePercentage =
    marked > 0
      ? Math.round((present / marked) * 100)
      : 0;

  /*
   * Month navigation
   */
  const goPreviousMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((year) => year - 1);
    } else {
      setViewMonth((month) => month - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((year) => year + 1);
    } else {
      setViewMonth((month) => month + 1);
    }
  };

  const isToday = (day) => {
    return (
      keyFor(viewYear, viewMonth, day) ===
      todayKey()
    );
  };

  const activeEntry = activeKey
    ? data[activeKey]
    : null;

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            HOSTEL LEDGER
          </Text>

          <Text style={styles.title}>
            {MONTH_NAMES[viewMonth]}{" "}
            <Text style={styles.titleYear}>
              {viewYear}
            </Text>
          </Text>
        </View>

        <TouchableOpacity
          style={styles.menuButton}
          onPress={() =>
            setStatsOpen((open) => !open)
          }
          activeOpacity={0.8}
        >
          <Text style={styles.menuText}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* Statistics */}
      {statsOpen && (
        <View style={styles.statsCard}>
          <Text style={styles.statsHeading}>
            {MONTH_NAMES[viewMonth]} summary
          </Text>

          <StatRow
            label="Present"
            value={present}
            color="#6FA37C"
          />

          <StatRow
            label="Absent"
            value={absent}
            color="#C4695A"
          />

          <StatRow
            label="Unmarked"
            value={unmarked}
            color="#8A8578"
          />

          <View style={styles.divider} />

          <View style={styles.statsRow}>
            <Text style={styles.statsText}>
              Attendance
            </Text>

            <Text style={styles.statsPercentage}>
              {attendancePercentage}%
            </Text>
          </View>
        </View>
      )}

      {/* Month navigation */}
      <View style={styles.navigationRow}>
        <TouchableOpacity
          style={styles.navigationButton}
          onPress={goPreviousMonth}
          activeOpacity={0.7}
        >
          <Text style={styles.navigationArrow}>
            ‹
          </Text>
        </TouchableOpacity>

        <Text style={styles.navigationLabel}>
          {marked}/{daysInMonth} days marked
        </Text>

        <TouchableOpacity
          style={styles.navigationButton}
          onPress={goNextMonth}
          activeOpacity={0.7}
        >
          <Text style={styles.navigationArrow}>
            ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* Weekday labels */}
      <View style={styles.dayLabelRow}>
        {DAY_LABELS.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            style={styles.dayLabel}
          >
            {label}
          </Text>
        ))}
      </View>

      {/* Calendar */}
      <View style={styles.calendarGrid}>
        {cells.map((day, index) => {
          if (day === null) {
            return (
              <View
                key={`empty-${index}`}
                style={styles.calendarCell}
              />
            );
          }

          const key = keyFor(
            viewYear,
            viewMonth,
            day
          );

          const entry = data[key];
          const status = entry?.status;

          let backgroundColor = "#FFFFFF";
          let textColor = "#20241F";

          if (status === "present") {
            backgroundColor = "#4C7A5E";
            textColor = "#F5F3EA";
          }

          if (status === "absent") {
            backgroundColor = "#B4483A";
            textColor = "#F5F3EA";
          }

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.calendarCell,
                {
                  backgroundColor,
                  borderColor: isToday(day)
                    ? "#C79A4B"
                    : "#DEDACB",
                  borderWidth: isToday(day)
                    ? 2
                    : 1,
                },
              ]}
              onPress={() =>
                openDay(
                  viewYear,
                  viewMonth,
                  day
                )
              }
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.calendarDayText,
                  {
                    color: textColor,
                    fontWeight: isToday(day)
                      ? "700"
                      : "400",
                  },
                ]}
              >
                {day}
              </Text>

              {entry?.note ? (
                <View
                  style={[
                    styles.noteDot,
                    {
                      backgroundColor: status
                        ? textColor
                        : "#C79A4B",
                    },
                  ]}
                />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <LegendDot
          color="#4C7A5E"
          label="Present"
        />

        <LegendDot
          color="#B4483A"
          label="Absent"
        />

        <LegendDot
          color="#FFFFFF"
          label="Unmarked"
          border
        />
      </View>

      <Text style={styles.hint}>
        Tap a day to mark Present, Absent, or add a
        note.
      </Text>

      {loaded && (
        <Text style={styles.savedText}>
          Saved locally on this device
        </Text>
      )}

      {/* Day modal */}
      <Modal
        visible={!!activeKey}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalDate}>
              {activeKey
                ? formatKey(activeKey)
                : ""}
            </Text>

            {activeEntry?.status ? (
              <Text
                style={[
                  styles.currentStatus,
                  {
                    color:
                      activeEntry.status ===
                      "present"
                        ? "#4C7A5E"
                        : "#B4483A",
                  },
                ]}
              >
                Currently marked{" "}
                {activeEntry.status}
              </Text>
            ) : null}

            <Text style={styles.noteLabel}>
              Note (optional)
            </Text>

            <TextInput
              value={draftNote}
              onChangeText={setDraftNote}
              placeholder="e.g. left early for exam"
              placeholderTextColor="#B0AC9C"
              style={styles.noteInput}
              multiline
              onBlur={saveNoteOnly}
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.presentButton,
                ]}
                onPress={() =>
                  setStatus("present")
                }
                activeOpacity={0.8}
              >
                <Text style={styles.modalButtonText}>
                  Present
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.absentButton,
                ]}
                onPress={() =>
                  setStatus("absent")
                }
                activeOpacity={0.8}
              >
                <Text style={styles.modalButtonText}>
                  Absent
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                onPress={clearDay}
                activeOpacity={0.7}
              >
                <Text style={styles.footerLink}>
                  Clear
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={closeModal}
                activeOpacity={0.7}
              >
                <Text style={styles.footerLink}>
                  Close
                </Text>
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
      <View style={styles.statLabelContainer}>
        <View
          style={[
            styles.statDot,
            { backgroundColor: color },
          ]}
        />

        <Text style={styles.statsText}>
          {label}
        </Text>
      </View>

      <Text style={styles.statsText}>
        {value}
      </Text>
    </View>
  );
}

function LegendDot({
  color,
  label,
  border = false,
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          {
            backgroundColor: color,
            borderWidth: border ? 1 : 0,
            borderColor: "#DEDACB",
          },
        ]}
      />

      <Text style={styles.legendText}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F0EFE6",
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#8A8578",
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#20241F",
    marginTop: 2,
  },

  titleYear: {
    color: "#8A8578",
    fontWeight: "400",
  },

  menuButton: {
    backgroundColor: "#20241F",
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  menuText: {
    color: "#F0EFE6",
    fontSize: 18,
  },

  statsCard: {
    backgroundColor: "#20241F",
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
  },

  statsHeading: {
    fontSize: 10,
    letterSpacing: 1,
    color: "#9C9788",
    marginBottom: 8,
    textTransform: "uppercase",
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },

  statLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },

  statsText: {
    color: "#F0EFE6",
  },

  statsPercentage: {
    color: "#F0EFE6",
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#3A3F35",
    marginVertical: 8,
  },

  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },

  navigationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 10,
  },

  navigationButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DEDACB",
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  navigationArrow: {
    fontSize: 22,
    color: "#20241F",
    lineHeight: 24,
  },

  navigationLabel: {
    fontSize: 12,
    color: "#8A8578",
  },

  dayLabelRow: {
    flexDirection: "row",
  },

  dayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    color: "#8A8578",
  },

  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  calendarCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 3,
  },

  calendarDayText: {
    fontSize: 14,
  },

  noteDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  legendRow: {
    flexDirection: "row",
    marginTop: 16,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },

  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    marginRight: 5,
  },

  legendText: {
    fontSize: 11,
    color: "#8A8578",
  },

  hint: {
    fontSize: 11,
    color: "#B0AC9C",
    marginTop: 6,
  },

  savedText: {
    fontSize: 10,
    color: "#C7C3B4",
    marginTop: 10,
    textAlign: "right",
  },

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

  modalDate: {
    fontSize: 18,
    fontWeight: "700",
    color: "#20241F",
  },

  currentStatus: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },

  noteLabel: {
    fontSize: 11,
    color: "#8A8578",
    marginTop: 14,
    marginBottom: 6,
  },

  noteInput: {
    borderWidth: 1,
    borderColor: "#DEDACB",
