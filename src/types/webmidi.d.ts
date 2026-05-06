interface MIDIInputMapLike extends Iterable<[string, MIDIInput]> {
  forEach(
    callbackfn: (value: MIDIInput, key: string, parent: MIDIInputMapLike) => void
  ): void;
}

interface MIDIAccess {
  inputs: MIDIInputMapLike;
  onstatechange: ((this: MIDIAccess, ev: Event) => void) | null;
}

interface MIDIConnectionEvent extends Event {
  port?: MIDIPort;
}

interface MIDIPort {
  id: string;
  manufacturer?: string;
  name?: string;
  state?: "connected" | "disconnected";
  connection?: "open" | "closed" | "pending";
}

interface MIDIInput extends MIDIPort {
  onmidimessage: ((this: MIDIInput, ev: MIDIMessageEvent) => void) | null;
}

interface MIDIMessageEvent extends Event {
  data?: Uint8Array;
}

interface Navigator {
  requestMIDIAccess?: () => Promise<MIDIAccess>;
}
