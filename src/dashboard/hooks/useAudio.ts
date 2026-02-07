import { useEffect, useState, useCallback, useRef } from 'react';
import { sonification, SonificationState } from '../audio/Sonification';
import { useGenesisStore } from '../stores/genesisStore';

// ============================================================================
// useAudio Hook - Connects Genesis state to sonification
// ============================================================================

export function useAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.3);
  const lastModeRef = useRef<string>('');

  const { consciousness, neuromod, kernel, agents } = useGenesisStore();

  // Toggle audio on/off
  const toggleAudio = useCallback(() => {
    const playing = sonification.toggle();
    setIsPlaying(playing);
  }, []);

  // Set volume
  const setVolume = useCallback((v: number) => {
    sonification.setVolume(v);
    setVolumeState(v);
  }, []);

  // Update sonification with current state
  useEffect(() => {
    if (!isPlaying) return;

    const state: SonificationState = {
      phi: consciousness.phi,
      freeEnergy: kernel.freeEnergy,
      dopamine: neuromod.dopamine,
      serotonin: neuromod.serotonin,
      norepinephrine: neuromod.norepinephrine,
      cortisol: neuromod.cortisol,
      agentActivity: agents.active / agents.total,
      mode: kernel.mode,
    };

    sonification.update(state);

    // Play mode change sound
    if (kernel.mode !== lastModeRef.current && lastModeRef.current !== '') {
      sonification.playModeChange(kernel.mode);
    }
    lastModeRef.current = kernel.mode;
  }, [isPlaying, consciousness, neuromod, kernel, agents]);

  // Play specific sounds
  const playAlert = useCallback((type: 'warning' | 'error' | 'success' | 'info') => {
    sonification.playAlert(type);
  }, []);

  const playAgentActivation = useCallback(() => {
    sonification.playAgentActivation();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sonification.stop();
    };
  }, []);

  return {
    isPlaying,
    volume,
    toggleAudio,
    setVolume,
    playAlert,
    playAgentActivation,
  };
}
