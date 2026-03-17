import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRST_PLAY_KEY = '@aura50_first_play_done';
const { width, height } = Dimensions.get('window');

const INTRO_SOURCES = [
  require('../../assets/intro-video.mp4'),
  require('../../assets/Intro_Video.mp4'),
];

interface Props {
  onFinished: () => void;
}

export function SplashVideoScreen({ onFinished }: Props) {
  const videoRef = useRef<Video>(null);
  const [isFirstPlay, setIsFirstPlay] = useState<boolean | null>(null);
  const [source, setSource] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const done = await AsyncStorage.getItem(FIRST_PLAY_KEY);
      if (!done) {
        setIsFirstPlay(true);
        setSource(require('../../assets/first-play.mp4'));
      } else {
        setIsFirstPlay(false);
        setSource(INTRO_SOURCES[Math.random() < 0.5 ? 0 : 1]);
      }
    })();
  }, []);

  const finish = async () => {
    if (isFirstPlay) {
      await AsyncStorage.setItem(FIRST_PLAY_KEY, 'true');
    }
    onFinished();
  };

  const onPlaybackUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded && status.didJustFinish) {
      finish();
    }
  };

  if (source === null) return null;

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={source}
        style={styles.video}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping={false}
        isMuted={!isFirstPlay}
        onPlaybackStatusUpdate={onPlaybackUpdate}
      />

      {/* Skip button — only for random branding intros, not first-play */}
      {isFirstPlay === false && (
        <TouchableOpacity
          style={styles.skipCapsule}
          onPress={finish}
          activeOpacity={0.75}
        >
          <Text style={styles.skipText}>Skip  ›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 9999,
    elevation: 9999,
  },
  video: {
    width,
    height,
  },
  skipCapsule: {
    position: 'absolute',
    bottom: 64,
    right: 24,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    overflow: 'hidden',
  },
  skipText: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
});
