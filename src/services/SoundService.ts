import { Audio } from 'expo-av';

class SoundService {
  private static instance: SoundService;
  private sound: Audio.Sound | null = null;

  private constructor() {}

  static getInstance(): SoundService {
    if (!SoundService.instance) {
      SoundService.instance = new SoundService();
    }
    return SoundService.instance;
  }

  async loadSounds(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/coin_received.wav'),
        { shouldPlay: false }
      );
      this.sound = sound;
    } catch (error) {
      console.warn('SoundService: failed to load coin_received.wav', error);
    }
  }

  async playCoinSound(): Promise<void> {
    try {
      if (!this.sound) return;
      await this.sound.setPositionAsync(0);
      await this.sound.playAsync();
    } catch (error) {
      console.warn('SoundService: failed to play coin sound', error);
    }
  }
}

export const soundService = SoundService.getInstance();
