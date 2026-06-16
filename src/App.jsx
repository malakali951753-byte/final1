import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useTaskStore, { STATUSES, PRIORITIES } from './store/taskStore';

// Spring physics used across the UI
const SPRING = { type: 'spring', stiffness: 300, damping: 25 };

const priorityGlow = {
    High: 'shadow-[0_0_18px_rgba(220,38,56,0.28)]', // crimson
    Medium: 'shadow-[0_0_18px_rgba(234,88,12,0.22)]', // amber
    Low: 'shadow-[0_0_18px_rgba(16,185,129,0.20)]' // emerald
};

function useMountLoader(delay = 1500) {
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const t = setTimeout(() => setLoading(false), delay);
        return () => clearTimeout(t);
    }, [delay]);
    return loading;
}

function playSuccessPop() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(880, ctx.currentTime);
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        o.connect(g); g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.5);
    } catch (e) {
        // fallback: ignored
    }
}

const SkeletonCard = () => (
    <div className="w-full h-24 rounded-2xl bg-gradient-to-r from-white/6 to-white/3 backdrop-blur-xl border border-white/5 animate-pulse" />
);

export default function App() {
    const loading = useMountLoader(1500);

    const tasks = useTaskStore(state => state.tasks);
    const addTask = useTaskStore(state => state.addTask);
    const deleteTask = useTaskStore(state => state.deleteTask);
    const moveTask = useTaskStore(state => state.moveTask);
    const setActiveTab = useTaskStore(state => state.setActiveTab);
    const getCompletionPercentage = useTaskStore(state => state.getCompletionPercentage);
    const getTasksSummary = useTaskStore(state => state.getTasksSummary);

    const [focusMode, setFocusMode] = useState(false);
    const [vaultOpen, setVaultOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);

    const todo = tasks.filter(t => t.status === 'todo');
    const inProgress = tasks.filter(t => t.status === 'in-progress');
    const archived = tasks.filter(t => t.status === 'done');

    const completion = getCompletionPercentage();
    const summary = getTasksSummary();

    // Demo data helper
    const populateDemo = () => {
        setActiveTab('dashboard');
        const demo = [
            { title: 'Design flagship landing hero', description: 'Craft a cinematic hero with motion-driven copy blocks.', priority: 'High', status: 'in-progress' },
            { title: 'Polish onboarding flow', description: 'Refine microcopy & loading states for conversion lift.', priority: 'Medium', status: 'todo' },
            { title: 'Integrate analytics', description: 'Define events and dashboards for week-1 launch.', priority: 'High', status: 'todo' },
            { title: 'Accessibility pass', description: 'Run contrast & keyboard audits.', priority: 'Low', status: 'in-progress' },
            { title: 'Create release notes', description: 'Prepare human-friendly changelog and highlights.', priority: 'Medium', status: 'todo' }
        ];
        demo.forEach(d => addTask({ title: d.title, description: d.description, priority: d.priority, status: d.status }));
    };

    // Floating modal form local state
    const [form, setForm] = useState({ title: '', description: '', priority: 'Medium' });
    const submitForm = (e) => {
        e.preventDefault();
        if (!form.title.trim()) return;
        addTask({ title: form.title.trim(), description: form.description.trim(), priority: form.priority, status: 'todo' });
        setForm({ title: '', description: '', priority: 'Medium' });
        setModalOpen(false);
    };

    // accessibility: focus management for modal
    const titleRef = useRef(null);
    const modalRef = useRef(null);
    useEffect(() => {
        if (modalOpen) {
            // small timeout to allow element to mount
            const t = setTimeout(() => titleRef.current?.focus(), 50);
            // lock scroll
            const prevOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { clearTimeout(t); document.body.style.overflow = prevOverflow; };
        }
    }, [modalOpen]);

    // focus trap for modal
    useEffect(() => {
        if (!modalOpen) return;
        const node = modalRef.current;
        if (!node) return;
        const focusableSelectors = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
        const elements = Array.from(node.querySelectorAll(focusableSelectors)).filter(el => !el.hasAttribute('disabled'));
        const first = elements[0];
        const last = elements[elements.length - 1];
        const onKey = (e) => {
            if (e.key !== 'Tab') return;
            if (elements.length === 0) { e.preventDefault(); return; }
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else {
                if (document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [modalOpen]);

    // keyboard shortcuts and Escape handling
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') {
                if (modalOpen) setModalOpen(false);
            }
            if (e.key === 'f' || e.key === 'F') {
                setFocusMode(v => !v);
            }
            if (e.key === 'd' || e.key === 'D') {
                populateDemo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [modalOpen]);

    // Handler when completing a task: animate then archive
    const handleComplete = async (id) => {
        playSuccessPop();
        // Slight delay to let checkmark animation play client-side
        // Archive via store so we have undo metadata
        setTimeout(() => {
            useTaskStore.getState().archiveTask(id);
            // show undo toast
            setUndoToast({ visible: true, id });
            // auto-dismiss after 6s
            const t = setTimeout(() => setUndoToast({ visible: false, id: null }), 6000);
            setUndoTimer(t);
        }, 420);
    };

    // Drag-end threshold action: horizontal swipe to move between columns
    const handleDragEnd = (task, info) => {
        const x = info.offset.x;
        // if dragged right enough, move forward; left enough, move back
        if (x > 120 && task.status === 'todo') moveTask(task.id, 'in-progress');
        if (x < -120 && task.status === 'in-progress') moveTask(task.id, 'todo');
    };

    // Card component
    const Card = ({ task }) => {
        const [completing, setCompleting] = useState(false);
        useEffect(() => { if (task.status === 'done') setCompleting(false); }, [task.status]);
        return (
            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.98, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, rotate: 12 }}
                transition={SPRING}
                drag="x"
                dragConstraints={{ left: -300, right: 300 }}
                dragElastic={0.18}
                onDragEnd={(e, info) => handleDragEnd(task, info)}
                className={
                    `group relative p-4 rounded-2xl bg-white/3 backdrop-blur-xl border border-white/6 cursor-grab transform-gpu` +
                    ` hover:scale-[1.01] transition-all duration-200` +
                    ` ${priorityGlow[task.priority]}`
                }
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                        <h3 className="flex items-center gap-3 text-white text-lg font-semibold">
                            <span className="text-[18px]">{task.title}</span>
                            <AnimatePresence>
                                {completing && (
                                    <motion.span
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1.4, opacity: 1 }}
                                        exit={{ scale: 0.6, opacity: 0 }}
                                        transition={{ duration: 0.35 }}
                                        className="text-emerald-400"
                                    >
                                        ✓
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </h3>
                        <p className="mt-2 text-sm text-white/70 line-clamp-2">{task.description}</p>
                        <div className="mt-3 flex items-center gap-2">
                            <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-white/80">{task.priority}</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-white/3 text-white/70">{task.status}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <button
                            aria-label="Complete"
                            onClick={() => { setCompleting(true); handleComplete(task.id); }}
                            className="rounded-xl p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300"
                        >
                            <motion.span whileTap={{ scale: 0.9 }}>
                                ✓
                            </motion.span>
                        </button>
                        <button onClick={() => deleteTask(task.id)} className="rounded-xl p-2 bg-red-500/10 hover:bg-red-500/20 text-red-300">
                            ✕
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    };

    // Undo toast state
    const [undoToast, setUndoToast] = useState({ visible: false, id: null });
    const [undoTimer, setUndoTimer] = useState(null);

    const handleUndo = () => {
        if (undoTimer) { clearTimeout(undoTimer); setUndoTimer(null); }
        useTaskStore.getState().undoLastArchive();
        setUndoToast({ visible: false, id: null });
    };

    return (
        <div className="min-h-screen w-full bg-gradient-to-b from-indigo-950 via-slate-950 to-slate-950 text-white p-8">
            <div className="max-w-[1200px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-3xl bg-white/3 backdrop-blur-xl border border-white/6">
                            <h1 className="text-2xl font-extrabold tracking-tight">Nebula Tasks</h1>
                            <p className="text-sm text-white/70">A premium task dashboard — sculpted motion & glass.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setModalOpen(true)} className="px-4 py-2 rounded-2xl bg-white/5 border border-white/8 hover:bg-white/6">New Task</button>
                            <button onClick={() => { populateDemo(); }} className="px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500/10 to-emerald-400/8 border border-white/6">⚡ Populate AI Demo Data</button>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-3xl bg-white/3 border border-white/6">
                            <label className="text-sm text-white/80 mr-2">Focus</label>
                            <button onClick={() => setFocusMode(v => !v)} className={`px-3 py-1 rounded-full ${focusMode ? 'bg-emerald-500/30' : 'bg-white/6'}`}>{focusMode ? 'ZEN ON' : 'ZEN'}</button>
                        </div>
                        <div className="text-right p-3 rounded-2xl bg-white/3 border border-white/6">
                            <div className="text-xs text-white/60">Vault</div>
                            <div className="text-sm font-medium">{archived.length}/{tasks.length || 0} Archived</div>
                        </div>
                    </div>
                </div>

                {/* Main board */}
                <div className="relative">
                    <motion.div
                        className={`grid grid-cols-2 gap-6 ${focusMode ? 'justify-items-center' : ''}`}
                        animate={{ filter: focusMode ? 'blur(0px)' : 'none' }}
                    >
                        {/* To Do Column */}
                        <div className={`rounded-3xl p-6 ${focusMode ? 'opacity-60' : 'opacity-100'} bg-gradient-to-b from-white/3 to-white/6 backdrop-blur-xl border border-white/6`}>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold">📋 To Do</h2>
                                <div className="text-sm text-white/60">{todo.length}</div>
                            </div>
                            <div className="space-y-4">
                                {loading ? (
                                    Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
                                ) : (
                                    <AnimatePresence>
                                        {todo.map(t => (
                                            <Card key={t.id} task={t} />
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>
                        </div>

                        {/* In Progress Column */}
                        <div className={`rounded-3xl p-6 ${focusMode ? 'scale-105 col-start-1 col-end-3 mx-auto max-w-2xl' : ''} bg-gradient-to-b from-white/3 to-white/6 backdrop-blur-xl border border-white/6`}>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold">⚙️ In Progress</h2>
                                <div className="text-sm text-white/60">{inProgress.length}</div>
                            </div>
                            <div className="space-y-4">
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                                ) : (
                                    <AnimatePresence>
                                        {inProgress.map(t => (
                                            <Card key={t.id} task={t} />
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Vault / Completed Archive Panel */}
                <motion.div
                    initial={{ y: 60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6 }}
                    className="mt-8 rounded-3xl p-4 bg-white/5 backdrop-blur-xl border border-white/8"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm text-white/70">Sleek Vault</div>
                            <div className="text-lg font-semibold">Completed Archive</div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-64">
                                <div className="text-xs text-white/60 mb-1">{archived.length}/{tasks.length || 0} Tasks Archived Successfully</div>
                                <div className="w-full h-2 bg-white/6 rounded-full overflow-hidden">
                                    <motion.div className="h-2 bg-emerald-400/80 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.18)]" style={{ width: `${completion}%` }} transition={SPRING} />
                                </div>
                            </div>
                            <button onClick={() => setVaultOpen(v => !v)} className="px-4 py-2 rounded-2xl bg-white/6 border border-white/8">{vaultOpen ? 'Hide' : 'Show'} Archive</button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {vaultOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="mt-4 overflow-hidden">
                                <div className="grid grid-cols-3 gap-4">
                                    {archived.length === 0 && <div className="col-span-3 text-white/60">No archived tasks yet — complete tasks to see them here.</div>}
                                    {archived.map(a => (
                                        <div key={a.id} className="p-3 rounded-2xl bg-white/3 border border-white/6">
                                            <div className="font-semibold">{a.title}</div>
                                            <div className="text-xs text-white/60 mt-1">{a.description}</div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
                {/* Undo toast */}
                <AnimatePresence>
                    {undoToast.visible && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={SPRING} className="fixed right-6 bottom-6 z-50">
                            <div className="p-3 rounded-2xl bg-white/6 backdrop-blur-xl border border-white/8 flex items-center gap-4">
                                <div className="text-sm">Task archived</div>
                                <button onClick={handleUndo} className="px-3 py-1 rounded-full bg-emerald-500/20">Undo</button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Floating modal */}
            <AnimatePresence>
                {modalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Create task dialog">
                        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
                        <motion.form ref={modalRef} onSubmit={submitForm} initial={{ y: 40, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }} transition={SPRING} className="relative z-50 w-[540px] p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/7">
                            <h3 className="text-lg font-semibold mb-2">Create Task</h3>
                            <div className="flex flex-col gap-3">
                                <input ref={titleRef} aria-label="Task title" value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))} placeholder="Title" className="w-full p-3 rounded-xl bg-white/4 border border-white/6" />
                                <textarea aria-label="Task description" value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))} placeholder="Description" className="w-full p-3 rounded-xl bg-white/4 border border-white/6" rows={4} />
                                <div className="flex items-center justify-between">
                                    <label className="sr-only" htmlFor="priority-select">Priority</label>
                                    <select id="priority-select" aria-label="Priority" value={form.priority} onChange={e => setForm(s => ({ ...s, priority: e.target.value }))} className="p-2 rounded-xl bg-white/4 border border-white/6">
                                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                    <div className="flex items-center gap-2">
                                        <button type="button" aria-label="Cancel create task" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-2xl bg-white/6">Cancel</button>
                                        <button type="submit" aria-label="Create task" className="px-4 py-2 rounded-2xl bg-emerald-500/20 border border-emerald-400">Create</button>
                                    </div>
                                </div>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
