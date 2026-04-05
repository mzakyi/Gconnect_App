import React from 'react';
import { View, StyleSheet, Image, Dimensions, Share, Alert } from 'react-native';
import { IconButton } from 'react-native-paper';
import { downloadMediaFile } from '../../services/chatService';

const { width, height } = Dimensions.get('window');

export default function ImageViewerScreen({ route, navigation }) {
  const { uri } = route.params;

  const handleDownload = async () => {
    try {
      const fileName = uri.split('/').pop() || `image_${Date.now()}.jpg`;
      await downloadMediaFile(uri, fileName);
    } catch (error) {
      console.error('Download failed:', error);
      Alert.alert('Error', 'Failed to download image');
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: 'Check out this image from RTD Alumni',
        url: uri,
      });
    } catch (error) {
      console.error('Share failed:', error);
      Alert.alert('Error', 'Failed to share image');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="close"
          iconColor="#fff"
          size={28}
          onPress={() => navigation.goBack()}
        />
        <View style={styles.headerActions}>
          <IconButton
            icon="download"
            iconColor="#fff"
            size={24}
            onPress={handleDownload}
          />
          <IconButton
            icon="share-variant"
            iconColor="#fff"
            size={24}
            onPress={handleShare}
          />
        </View>
      </View>

      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  headerActions: {
    flexDirection: 'row',
  },
  image: {
    width,
    height,
  },
});