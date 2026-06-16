import { beforeEach, describe, it, expect } from 'vitest';
import useTaskStore from './taskStore';

// Ensure each test starts with a clean store
beforeEach(() => {
    // Reset tasks and tab to known initial state
    useTaskStore.setState({ tasks: [], activeTab: 'welcome' });
});

describe('taskStore (Zustand)', () => {
    it('adds new tasks with correct fields and priorities', () => {
        const addTask = useTaskStore.getState().addTask;

        const idHigh = addTask({ title: 'High priority task', description: 'Critical UI polish', priority: 'High', status: 'todo' });
        const idMed = addTask({ title: 'Medium priority task', description: 'Write tests', priority: 'Medium', status: 'todo' });
        const idLow = addTask({ title: 'Low priority task', description: 'Refactor docs', priority: 'Low', status: 'in-progress' });

        const tasks = useTaskStore.getState().tasks;
        expect(tasks.length).toBe(3);

        const high = tasks.find(t => t.id === idHigh);
        const med = tasks.find(t => t.id === idMed);
        const low = tasks.find(t => t.id === idLow);

        expect(high).toBeDefined();
        expect(high.title).toBe('High priority task');
        expect(high.description).toBe('Critical UI polish');
        expect(high.priority).toBe('High');
        expect(high.status).toBe('todo');

        expect(med).toBeDefined();
        expect(med.priority).toBe('Medium');

        expect(low).toBeDefined();
        expect(low.priority).toBe('Low');
        expect(low.status).toBe('in-progress');
    });

    it('deletes a task and reduces the tasks array length', () => {
        const addTask = useTaskStore.getState().addTask;
        const deleteTask = useTaskStore.getState().deleteTask;

        const a = addTask({ title: 'A' });
        const b = addTask({ title: 'B' });

        let tasks = useTaskStore.getState().tasks;
        expect(tasks.length).toBe(2);

        deleteTask(a);
        tasks = useTaskStore.getState().tasks;
        expect(tasks.length).toBe(1);
        expect(tasks.find(t => t.id === a)).toBeUndefined();
        expect(tasks[0].id).toBe(b);
    });

    it('moves a task between statuses and reflects completion correctly', () => {
        const addTask = useTaskStore.getState().addTask;
        const moveTask = useTaskStore.getState().moveTask;
        const getCompletionPercentage = useTaskStore.getState().getCompletionPercentage;

        const id = addTask({ title: 'Movable', status: 'todo' });
        expect(useTaskStore.getState().tasks.find(t => t.id === id).status).toBe('todo');

        // move to in-progress
        moveTask(id, 'in-progress');
        expect(useTaskStore.getState().tasks.find(t => t.id === id).status).toBe('in-progress');

        // move to done (archived)
        moveTask(id, 'done');
        const moved = useTaskStore.getState().tasks.find(t => t.id === id);
        expect(moved.status).toBe('done');

        // with a single task done, completion should be 100
        expect(getCompletionPercentage()).toBe(100);
    });
});
