import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Radar,
  Plus,
  X,
  BellRing,
  BellOff,
  Search,
  RefreshCw,
  Volume2,
  VolumeX,
  Circle,
  Clock,
  MapPin,
  User,
} from "lucide-react";

const POLL_MS = 45_000;
const WATCH_KEY = "nsu-seat-watch:watchlist";

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(list) {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(list));
  } catch {}
}

function seatStatus(seats) {
  if (seats <= 0) return { label: "Full", color: "text-rose-400", ring: "ring-rose-500/30", dot: "bg-rose-500" };
  if (seats <= 5) return { label: "Tight", color: "text-amber-400", ring: "ring-amber-500/30", dot: "bg-amber-400" };
  return { label: "Open", color: "text-emerald-400", ring: "ring-emerald-500/30", dot: "bg-emerald-400" };
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1108.7];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14);
      osc.stop(ctx.currentTime + i * 0.14 + 0.32);
    });
  } catch {}
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [lastSynced, setLastSynced] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [courseInput, setCourseInput] = useState("");
  const [sectionInput, setSectionInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState(1);

  const [browseQuery, setBrowseQuery] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  const notifiedKeys = useRef(new Set());
  const pollTimer = useRef(null);

  useEffect(() => saveWatchlist(watchlist), [watchlist]);

  const fetchSeats = useCallback(async () => {
    try {
      const res = await fetch("/api/seats");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      setRows(data.rows);
      setLastSynced(data.lastSynced);
      setFetchedAt(data.fetchedAt);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeats();
    pollTimer.current = setInterval(fetchSeats, POLL_MS);
    return () => clearInterval(pollTimer.current);
  }, [fetchSeats]);

  // Match rows against watches, and fire alerts on threshold crossing
  const watchMatches = useMemo(() => {
    return watchlist.map((w) => {
      const matches = rows.filter((r) => {
        const courseHit = r.course.toUpperCase().includes(w.course.toUpperCase());
        const sectionHit = !w.section || r.section === w.section;
        return courseHit && sectionHit;
      });
      return { ...w, matches };
    });
  }, [watchlist, rows]);

  useEffect(() => {
    if (loading) return;
    watchMatches.forEach((w) => {
      w.matches.forEach((m) => {
        const key = `${w.id}:${m.course}:${m.section}`;
        const above = m.seats >= w.threshold;
        const wasNotified = notifiedKeys.current.has(key);
        if (above && !wasNotified) {
          notifiedKeys.current.add(key);
          triggerAlert(m, w);
        } else if (!above && wasNotified) {
          notifiedKeys.current.delete(key);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function triggerAlert(m, w) {
    if (soundOn) playChime();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`Seat open: ${m.course} — Sec ${m.section}`, {
        body: `${m.seats} seat${m.seats === 1 ? "" : "s"} available · ${m.faculty} · ${m.time}`,
        tag: `${m.course}-${m.section}`,
      });
    }
  }

  async function requestNotifPermission() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
  }

  function addWatch(e) {
    e.preventDefault();
    const course = courseInput.trim().toUpperCase();
    if (!course) return;
    const w = {
      id: `${Date.now()}`,
      course,
      section: sectionInput.trim(),
      threshold: Math.max(1, parseInt(thresholdInput, 10) || 1),
    };
    setWatchlist((list) => [...list, w]);
    setCourseInput("");
    setSectionInput("");
    setThresholdInput(1);
  }

  function removeWatch(id) {
    setWatchlist((list) => list.filter((w) => w.id !== id));
  }

  const browseResults = useMemo(() => {
    const q = browseQuery.trim().toUpperCase();
    if (!q) return [];
    return rows.filter((r) => r.course.toUpperCase().includes(q)).slice(0, 60);
  }, [browseQuery, rows]);

  return (
    <div className="min-h-screen bg-[#0A0C0F] text-slate-200 font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0A0C0F]/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-4 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30">
                <Radar className="h-5 w-5 text-emerald-400" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-base font-bold leading-none tracking-tight text-white sm:text-lg">
                  NSU Seat Watch
                </h1>
                <p className="mt-1 font-mono text-[11px] leading-none text-slate-500">
                  {loading
                    ? "connecting…"
                    : error
                    ? "connection error"
                    : `synced ${lastSynced || "—"}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundOn((s) => !s)}
                title={soundOn ? "Mute alert sound" : "Unmute alert sound"}
                className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
              >
                {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                onClick={requestNotifPermission}
                disabled={notifPermission === "granted"}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  notifPermission === "granted"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-white/10 text-slate-300 hover:bg-white/5"
                }`}
              >
                {notifPermission === "granted" ? (
                  <BellRing className="h-3.5 w-3.5" />
                ) : (
                  <BellOff className="h-3.5 w-3.5" />
                )}
                {notifPermission === "granted" ? "Alerts on" : "Enable alerts"}
              </button>
              <button
                onClick={fetchSeats}
                title="Refresh now"
                className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-7 sm:px-8">
        {error && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Couldn't reach the live feed ({error}). It'll retry automatically.
          </div>
        )}

        {/* Add watch */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Watch a course
          </h2>
          <form onSubmit={addWatch} className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_0.8fr_0.8fr_auto]">
            <input
              value={courseInput}
              onChange={(e) => setCourseInput(e.target.value)}
              placeholder="Course code, e.g. CSE115"
              className="rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <input
              value={sectionInput}
              onChange={(e) => setSectionInput(e.target.value)}
              placeholder="Section (optional)"
              className="rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <input
              type="number"
              min="1"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              placeholder="Notify at ≥ seats"
              className="rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Watch
            </button>
          </form>
          <p className="mt-2.5 font-mono text-[11px] text-slate-600">
            Leave section blank to watch every section of that course. Data refreshes every ~45s here, matching the source's 6-minute sync.
          </p>
        </section>

        {/* Watchlist */}
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Your watchlist {watchlist.length > 0 && `(${watchlist.length})`}
          </h2>

          {watchlist.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] py-10 text-center">
              <Circle className="mx-auto mb-2 h-5 w-5 text-slate-700" />
              <p className="text-sm text-slate-500">Nothing watched yet — add a course above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {watchMatches.map((w) => (
                <div
                  key={w.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <p className="font-mono text-sm font-bold text-white">
                        {w.course}
                        {w.section && <span className="text-slate-500"> · Sec {w.section}</span>}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                        alert at ≥ {w.threshold} seat{w.threshold === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button
                      onClick={() => removeWatch(w.id)}
                      className="rounded-md p-1 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {w.matches.length === 0 ? (
                    <p className="rounded-lg bg-black/30 px-3 py-2 text-xs text-slate-600">
                      No matching sections found in current data.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {w.matches.slice(0, 5).map((m, i) => {
                        const s = seatStatus(m.seats);
                        const isOpen = m.seats >= w.threshold;
                        return (
                          <div
                            key={i}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                              isOpen
                                ? `border-emerald-500/30 bg-emerald-500/5 ${isOpen ? "pulse-open" : ""}`
                                : "border-white/5 bg-black/20"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-mono text-xs text-slate-300">
                                Sec {m.section} · {m.faculty}
                              </p>
                              <p className="truncate font-mono text-[10px] text-slate-600">{m.time}</p>
                            </div>
                            <span className={`shrink-0 font-mono text-sm font-bold ${s.color}`}>
                              {m.seats}
                            </span>
                          </div>
                        );
                      })}
                      {w.matches.length > 5 && (
                        <p className="pt-1 text-center font-mono text-[10px] text-slate-600">
                          +{w.matches.length - 5} more sections
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Browse */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Browse live data
          </h2>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5">
            <Search className="h-4 w-4 text-slate-600" />
            <input
              value={browseQuery}
              onChange={(e) => setBrowseQuery(e.target.value)}
              placeholder="Search any course code to see all its sections right now…"
              className="w-full bg-transparent font-mono text-sm text-white placeholder-slate-600 focus:outline-none"
            />
          </div>

          {browseQuery.trim() === "" ? (
            <p className="py-6 text-center text-sm text-slate-600">
              Type a course code above to browse its current sections and seat counts.
            </p>
          ) : browseResults.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">No matching courses found.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Course</th>
                    <th className="px-3 py-2.5 font-medium">Sec</th>
                    <th className="px-3 py-2.5 font-medium">
                      <User className="inline h-3 w-3" />
                    </th>
                    <th className="px-3 py-2.5 font-medium">
                      <Clock className="inline h-3 w-3" />
                    </th>
                    <th className="px-3 py-2.5 font-medium">
                      <MapPin className="inline h-3 w-3" />
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">Seats</th>
                  </tr>
                </thead>
                <tbody>
                  {browseResults.map((r, i) => {
                    const s = seatStatus(r.seats);
                    return (
                      <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-mono font-semibold text-white">{r.course}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{r.section}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{r.faculty}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.time}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.room}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${s.color}`}>
                          {r.seats}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 py-6 text-center font-mono text-[11px] text-slate-700 sm:px-8">
        Data sourced live from rds4.northsouth.ac.bd — not an official NSU service.
      </footer>
    </div>
  );
}
