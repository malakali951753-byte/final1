import create from 'zustand';

/**
 * @typedef {'todo' | 'in-progress' | 'done'} TaskStatus
 * @typedef {'High' | 'Medium' | 'Low'} TaskPriority
 *
 * @typedef {Object} Task
 * @property {string} id - Unique identifier
 * @property {string} title - Short title
 * @property {string} description - Longer description
 * @property {TaskStatus} status - One of 'todo' | 'in-progress' | 'done'
 * @property {TaskPriority} priority - One of 'High' | 'Medium' | 'Low'
 */

/**
 * Helper: generate a compact unique id (no external deps).
 * @returns {string}
 */
const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Public status and priority constants for consistency.
 */
export const STATUSES = Object.freeze(['todo', 'in-progress', 'done']);
export const PRIORITIES = Object.freeze(['High', 'Medium', 'Low']);

/**
 * Zustand store for task management.
 * - tasks: Task[]
 * - activeTab: 'welcome' | 'dashboard'
 * - actions: addTask, deleteTask, moveTask, setActiveTab
 * - selectors/getters: getCompletionPercentage, getTasksByStatus
 */
export const useTaskStore = create((set, get) => ({
    /** @type {Task[]} */
    tasks: [],

    /** @type {'welcome' | 'dashboard'} */
    activeTab: 'welcome',

    /**
     * Add a new task. Accepts partial fields and returns the created task id.
     * @param {Object} payload
     * @param {string} payload.title
     * @param {string} [payload.description]
     * @param {TaskStatus} [payload.status]
     * @param {TaskPriority} [payload.priority]
     * @returns {string} id
     */
    addTask: ({ title, description = '', status = 'todo', priority = 'Medium' }) => {
        const id = generateId();
        const newTask = { id, title, description, status, priority };
        set(state => ({ tasks: [...state.tasks, newTask] }));
        return id;
    },

    /**
     * Delete a task by id.
     * @param {string} id
     */
    deleteTask: (id) => set(state => ({ tasks: state.tasks.filter(t => t.id !== id) })),

    /**
     * Move a task to a new status and optionally to a new index within that status group.
     * - If `index` is omitted, it appends to the end of the destination status group.
     * - `index` is the position within the destination status group (0-based).
     * @param {string} id
     * @param {TaskStatus} newStatus
     * @param {number} [index]
     */
    moveTask: (id, newStatus, index) => set(state => {
        const tasks = state.tasks.slice();
        const fromIdx = tasks.findIndex(t => t.id === id);
        if (fromIdx === -1) return {};

        const [task] = tasks.splice(fromIdx, 1);
        task.status = newStatus;

        // Collect global indices of tasks that belong to newStatus
        const statusGlobalIndices = [];
        tasks.forEach((t, i) => { if (t.status === newStatus) statusGlobalIndices.push(i); });

        let insertionGlobalIndex;
        if (typeof index === 'number' && index >= 0) {
            // clamp index within destination group bounds
            const clamped = Math.min(Math.max(index, 0), statusGlobalIndices.length);
            insertionGlobalIndex = statusGlobalIndices.length === 0 ? tasks.length : (clamped === statusGlobalIndices.length ? statusGlobalIndices[statusGlobalIndices.length - 1] + 1 : statusGlobalIndices[clamped]);
        } else {
            // append after the last item of that status (or at end)
            insertionGlobalIndex = statusGlobalIndices.length ? statusGlobalIndices[statusGlobalIndices.length - 1] + 1 : tasks.length;
        }

        tasks.splice(insertionGlobalIndex, 0, task);
        return { tasks };
    }),

    /**
     * Archive a task (move to 'done') while recording previous position/status so it can be undone.
     * Records minimal undo metadata on `lastArchived` in the store.
     * @param {string} id
     */
    archiveTask: (id) => set(state => {
        const tasks = state.tasks.slice();
        const idx = tasks.findIndex(t => t.id === id);
        if (idx === -1) return {};

        const task = tasks[idx];
        const prevStatus = task.status;

        // find position within its status group
        const sameStatus = tasks.filter(t => t.status === prevStatus);
        const posInGroup = sameStatus.findIndex(t => t.id === id);

        // Set status to done and move to end of done group
        task.status = 'done';

        // remove original and append after existing done items
        tasks.splice(idx, 1);
        const doneIndices = [];
        tasks.forEach((t, i) => { if (t.status === 'done') doneIndices.push(i); });
        const insertion = doneIndices.length ? doneIndices[doneIndices.length - 1] + 1 : tasks.length;
        tasks.splice(insertion, 0, task);

        const lastArchived = { id: task.id, prevStatus, posInGroup };
        return { tasks, lastArchived };
    }),

    /**
     * Undo the last archive action if available.
     */
    undoLastArchive: () => set(state => {
        const { lastArchived, tasks } = state;
        if (!lastArchived) return {};
        const { id, prevStatus, posInGroup } = lastArchived;

        const tasksCopy = tasks.slice();
        const idx = tasksCopy.findIndex(t => t.id === id);
        if (idx === -1) return { lastArchived: null };

        const [task] = tasksCopy.splice(idx, 1);
        task.status = prevStatus;

        // find global insertion point for posInGroup in prevStatus
        const statusGlobalIndices = [];
        tasksCopy.forEach((t, i) => { if (t.status === prevStatus) statusGlobalIndices.push(i); });
        const insertionGlobalIndex = statusGlobalIndices.length === 0 ? tasksCopy.length : (posInGroup >= statusGlobalIndices.length ? statusGlobalIndices[statusGlobalIndices.length - 1] + 1 : statusGlobalIndices[posInGroup]);

        tasksCopy.splice(insertionGlobalIndex, 0, task);
        return { tasks: tasksCopy, lastArchived: null };
    }),

    /**
     * Set the active tab to emulate multi-page feel.
     * @param {'welcome' | 'dashboard'} tab
     */
    setActiveTab: (tab) => set(() => ({ activeTab: tab })),

    /**
     * Get tasks filtered by status.
     * @param {TaskStatus} status
     * @returns {Task[]}
     */
    getTasksByStatus: (status) => get().tasks.filter(t => t.status === status),

    /**
     * Compute overall completion percentage (0-100) based on tasks in 'done'.
     * This is a dynamic getter — call it from components/selectors to get the latest value.
     * @returns {number}
     */
    getCompletionPercentage: () => {
        const tasks = get().tasks;
        if (!tasks.length) return 0;
        const done = tasks.reduce((acc, t) => acc + (t.status === 'done' ? 1 : 0), 0);
        return Math.round((done / tasks.length) * 100);
    },

    /**
     * Convenience: a summary of counts by status and current completion percent.
     * @returns {{counts: Record<TaskStatus, number>, completion: number}}
     */
    getTasksSummary: () => {
        const tasks = get().tasks;
        const counts = { 'todo': 0, 'in-progress': 0, 'done': 0 };
        tasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
        return { counts, completion: get().getCompletionPercentage() };
    }
}));

// Persist tasks to localStorage for simple offline resilience
const STORAGE_KEY = 'nebula.tasks.v1';

// Try rehydrate on initial load if localStorage is available
try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            // Seed the store with persisted tasks
            useTaskStore.setState({ tasks: parsed });
        }
    }
} catch (e) {
    // ignore parsing/localStorage errors
}

// Subscribe to tasks changes and persist them
if (typeof localStorage !== 'undefined') {
    useTaskStore.subscribe(
        (state) => state.tasks,
        (tasks) => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
            } catch (e) {
                // ignore quota/localStorage errors
            }
        }
    );
}

export default useTaskStore;
