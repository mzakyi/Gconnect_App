import React, { useState, useEffect, useContext } from 'react';

import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Text, Card, Surface, Chip } from 'react-native-paper';
import { db } from '../../../firebase.config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../../context/AuthContext';
import { collection, onSnapshot, collectionGroup, query, where } from 'firebase/firestore';



const { width } = Dimensions.get('window');

export default function Analytics() {
  const { organizationId } = useContext(AuthContext);
  const [analytics, setAnalytics] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalPosts: 0,
    totalComments: 0,
    totalEvents: 0,
    upcomingEvents: 0,
    totalAnnouncements: 0,
    totalLikes: 0,
    avgPostsPerUser: 0,
    avgCommentsPerPost: 0,
    engagementRate: 0,
    newUsersThisWeek: 0,
    newUsersThisMonth: 0,
    postsThisWeek: 0,
    eventsThisMonth: 0,
  });

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!organizationId) return; // ✅ ADD THIS
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let usersData = [];
    let postsData = [];
    let commentsCount = 0;
    let eventsData = [];
    let announcementsCount = 0;

    const calculateMetrics = () => {
      const approvedUsers = usersData.filter(
        (u) => u.status === 'approved'
      );

      const newUsersWeek = usersData.filter(
        (u) => u.createdAt?.toDate?.() > oneWeekAgo
      ).length;

      const newUsersMonth = usersData.filter(
        (u) => u.createdAt?.toDate?.() > oneMonthAgo
      ).length;

      const postsThisWeek = postsData.filter(
        (p) => p.createdAt?.toDate?.() > oneWeekAgo
      ).length;

      const totalLikes = postsData.reduce(
        (sum, post) => sum + (post.likes?.length || 0),
        0
      );

      const upcomingEvents = eventsData.filter(
        (e) => e.date?.toDate?.() > now
      ).length;

      const eventsThisMonth = eventsData.filter(
        (e) => e.createdAt?.toDate?.() > oneMonthAgo
      ).length;

      const avgPostsPerUser =
        approvedUsers.length > 0
          ? (postsData.length / approvedUsers.length).toFixed(1)
          : 0;

      const avgCommentsPerPost =
        postsData.length > 0
          ? (commentsCount / postsData.length).toFixed(1)
          : 0;

      const engagementRate =
        postsData.length > 0
          ? ((commentsCount + totalLikes) / postsData.length).toFixed(1)
          : 0;

      setAnalytics({
        totalUsers: approvedUsers.length,
        activeUsers: approvedUsers.length,
        totalPosts: postsData.length,
        totalComments: commentsCount,
        totalEvents: eventsData.length,
        upcomingEvents,
        totalAnnouncements: announcementsCount,
        totalLikes,
        avgPostsPerUser,
        avgCommentsPerPost,
        engagementRate,
        newUsersThisWeek: newUsersWeek,
        newUsersThisMonth: newUsersMonth,
        postsThisWeek,
        eventsThisMonth,
      });
    };

    const unsubUsers = onSnapshot(collection(db, 'organizations', organizationId, 'users')
, (snap) => {
      usersData = snap.docs.map((doc) => doc.data());
      calculateMetrics();
    });

    const unsubPosts = onSnapshot(collection(db, 'organizations', organizationId, 'posts')
, (snap) => {
      postsData = snap.docs.map((doc) => doc.data());
      calculateMetrics();
    });

  // ✅ REPLACE WITH
// In Analytics.js - replace the collectionGroup listener with this:
  const unsubComments = onSnapshot(
    collection(db, 'organizations', organizationId, 'posts'),
    (snap) => {
      // Count comments from the commentCount field on each post
      commentsCount = snap.docs.reduce((sum, doc) => {
        return sum + (doc.data().commentCount || 0);
      }, 0);
      calculateMetrics();
    }
  );

    const unsubEvents = onSnapshot(collection(db, 'organizations', organizationId, 'events'), (snap) => {
      eventsData = snap.docs.map((doc) => doc.data());
      calculateMetrics();
    });

    const unsubAnnouncements = onSnapshot(
      collection(db, 'organizations', organizationId, 'announcements'),
      (snap) => {
        announcementsCount = snap.size;
        calculateMetrics();
      }
    );

    return () => {
      unsubUsers();
      unsubPosts();
      unsubComments();
      unsubEvents();
      unsubAnnouncements();
    };
  }, [organizationId]);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  const analyticsCards = [
    {
      title: 'Total Users',
      value: analytics.totalUsers,
      icon: 'account-group',
      gradient: ['#2196F3', '#1976D2'],
      trend: `+${analytics.newUsersThisMonth} this month`,
    },
    {
      title: 'Total Posts',
      value: analytics.totalPosts,
      icon: 'post',
      gradient: ['#9C27B0', '#7B1FA2'],
      trend: `+${analytics.postsThisWeek} this week`,
    },
    {
      title: 'Total Events',
      value: analytics.totalEvents,
      icon: 'calendar',
      gradient: ['#FF9800', '#F57C00'],
      trend: `${analytics.upcomingEvents} upcoming`,
    },
    {
      title: 'Total Comments',
      value: analytics.totalComments,
      icon: 'comment',
      gradient: ['#4CAF50', '#388E3C'],
      trend: `${analytics.avgCommentsPerPost} avg per post`,
    },
    {
      title: 'Total Likes',
      value: analytics.totalLikes,
      icon: 'heart',
      gradient: ['#E91E63', '#C2185B'],
      trend: 'Across all posts',
    },
    {
      title: 'Announcements',
      value: analytics.totalAnnouncements,
      icon: 'bullhorn',
      gradient: ['#00BCD4', '#0097A7'],
      trend: 'Total created',
    },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#6366F1', '#8B5CF6']}
        style={styles.header}
      >
        <Text variant="headlineSmall" style={styles.headerTitle}>
          Platform Analytics
        </Text>
        <Text style={styles.headerSubtitle}>
          Live real-time data from Firestore
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.section}>
          <View style={styles.cardsGrid}>
            {analyticsCards.map((card, index) => (
              <Surface key={index} style={styles.metricCard} elevation={2}>
                <LinearGradient
                  colors={card.gradient}
                  style={styles.metricGradient}
                >
                  <MaterialCommunityIcons
                    name={card.icon}
                    size={28}
                    color="#fff"
                  />
                </LinearGradient>

                <Text style={styles.metricValue}>
                  {card.value}
                </Text>

                <Text style={styles.metricTitle}>
                  {card.title}
                </Text>

                <Chip
                  style={styles.trendChip}
                  textStyle={{ fontSize: 11 }}
                >
                  {card.trend}
                </Chip>
              </Surface>
            ))}
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },

  header: {
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },

  headerTitle: {
    color: '#fff',
    fontWeight: 'bold',
  },

  headerSubtitle: {
    color: '#fff',
    opacity: 0.9,
    marginTop: 5,
  },

  content: {
    flex: 1,
  },

  section: {
    padding: 20,
  },

  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  metricCard: {
    width: '48%',          // 🔥 better than manual width calc
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
    minHeight: 170,        // 🔥 prevents cutoff
  },

  metricGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  metricValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },

  metricTitle: {
    color: '#666',
    marginBottom: 10,
  },

  trendChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    height: undefined,     // 🔥 allow dynamic height
  },
});
