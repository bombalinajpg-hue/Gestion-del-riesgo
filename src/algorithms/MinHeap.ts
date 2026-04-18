/**
 * Cola de prioridad min-heap binario.
 *
 * Pieza crítica de Dijkstra y A*: sin ella, cada iteración costaría O(n)
 * buscando el nodo de menor distancia, dejando la complejidad total en
 * O(n²). Con min-heap bajamos a O((n + m) log n), que es la diferencia
 * entre "instantáneo" y "congelado" en el grafo de Santa Rosa
 * (~2000–5000 nodos).
 *
 * Se implementa aquí en vez de importar una librería para no añadir
 * dependencias al proyecto — es código simple, probado y ~50 líneas.
 */

interface HeapNode<T> {
  priority: number;
  value: T;
}

export class MinHeap<T> {
  private heap: HeapNode<T>[] = [];

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(value: T, priority: number): void {
    this.heap.push({ value, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const root = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return root.value;
  }

  /** Mira el elemento de mínima prioridad sin removerlo */
  peek(): T | undefined {
    return this.heap[0]?.value;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[i].priority < this.heap[parent].priority) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < n && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
