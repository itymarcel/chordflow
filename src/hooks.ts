import { useEffect, useMemo, useState } from "react";

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

function toDevices(access: MIDIAccess | null): MidiDevice[] {
  if (!access) {
    return [];
  }

  return Array.from(access.inputs, ([, input]) => ({
    id: input.id,
    name: input.name ?? "Unnamed MIDI input",
    manufacturer: input.manufacturer ?? "Unknown"
  }));
}

export function useMidiInputs() {
  const [access, setAccess] = useState<MIDIAccess | null>(null);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [midiSupported, setMidiSupported] = useState<boolean>(typeof navigator !== "undefined" && !!navigator.requestMIDIAccess);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setMidiSupported(false);
      return;
    }

    let mounted = true;

    navigator.requestMIDIAccess().then((nextAccess) => {
      if (!mounted) {
        return;
      }

      setAccess(nextAccess);
      const nextDevices = toDevices(nextAccess);
      setDevices(nextDevices);
      setSelectedId((current) => current || nextDevices[0]?.id || "");

      nextAccess.onstatechange = () => {
        const refreshed = toDevices(nextAccess);
        setDevices(refreshed);
        setSelectedId((current) => (refreshed.some((device) => device.id === current) ? current : refreshed[0]?.id || ""));
      };
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!access || !selectedId) {
      return;
    }

    const selectedInput = Array.from(access.inputs, ([, input]) => input).find((input) => input.id === selectedId);
    if (!selectedInput) {
      return;
    }

    const pressed = new Set<number>();

    selectedInput.onmidimessage = (event) => {
      const data = event.data;
      if (!data || data.length < 3) {
        return;
      }

      const status = data[0];
      const note = data[1];
      const velocity = data[2];
      const command = status & 0xf0;

      if (command === 0x90 && velocity > 0) {
        pressed.add(note);
      } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
        pressed.delete(note);
      }

      setActiveNotes(Array.from(pressed).sort((a, b) => a - b));
    };

    return () => {
      selectedInput.onmidimessage = null;
      pressed.clear();
      setActiveNotes([]);
    };
  }, [access, selectedId]);

  return useMemo(
    () => ({
      activeNotes,
      devices,
      midiSupported,
      selectedId,
      setSelectedId
    }),
    [activeNotes, devices, midiSupported, selectedId]
  );
}
