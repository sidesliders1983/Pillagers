/** Stable minimum queue: equal scores retain waypoint insertion order. */
export class WaypointQueue {
    private items: { index: number; score: number }[] = [];
    get length() { return this.items.length; }
    private before(a: { index: number; score: number }, b: { index: number; score: number }) {
        return a.score < b.score || a.score === b.score && a.index < b.index;
    }
    push(index: number, score: number) {
        const item = { index, score };
        let child = this.items.length;
        this.items.push(item);
        while (child > 0) {
            const parent = Math.floor((child - 1) / 2);
            if (!this.before(item, this.items[parent])) break;
            this.items[child] = this.items[parent];
            child = parent;
        }
        this.items[child] = item;
    }
    shift() {
        const first = this.items[0], last = this.items.pop()!;
        if (!this.items.length) return first.index;
        let parent = 0;
        while (parent * 2 + 1 < this.items.length) {
            let child = parent * 2 + 1;
            if (child + 1 < this.items.length && this.before(this.items[child + 1], this.items[child])) child++;
            if (!this.before(this.items[child], last)) break;
            this.items[parent] = this.items[child];
            parent = child;
        }
        this.items[parent] = last;
        return first.index;
    }
}
