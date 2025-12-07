import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/store';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Main chat screen.
 */
export default function ChatScreen() {
  const {
    serverUrl,
    token,
    user,
    currentWorkspace,
    channels,
    currentChannel,
    messages,
    setChannels,
    setCurrentChannel,
    setMessages,
    addMessage,
  } = useStore();

  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [showChannels, setShowChannels] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Load workspace data
  useEffect(() => {
    if (!token || !currentWorkspace) return;

    const loadData = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/workspaces/${currentWorkspace.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setChannels(data.channels || []);

        if (data.channels?.length > 0 && !currentChannel) {
          setCurrentChannel(data.channels[0]);
        }
      } catch (error) {
        console.error('Failed to load workspace:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, currentWorkspace, serverUrl]);

  // Connect to socket
  useEffect(() => {
    if (!token || !currentWorkspace) return;

    socket = io(serverUrl, { auth: { token } });

    socket.on('connect', () => {
      socket?.emit('workspace:join', currentWorkspace.id);
    });

    socket.on('message:new', (message) => {
      if (message.channelId === currentChannel?.id) {
        addMessage(message);
      }
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token, currentWorkspace, serverUrl]);

  // Load messages when channel changes
  useEffect(() => {
    if (!token || !currentChannel) return;

    const loadMessages = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/messages/channel/${currentChannel.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setMessages(data.messages || []);
        socket?.emit('channel:join', currentChannel.id);
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [token, currentChannel, serverUrl]);

  const handleSend = async () => {
    if (!messageInput.trim() || !currentChannel || !token) return;

    try {
      await fetch(`${serverUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channelId: currentChannel.id,
          content: messageInput.trim(),
        }),
      });
      setMessageInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const renderMessage = ({ item }: { item: any }) => (
    <View style={styles.messageContainer}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.user.displayName?.charAt(0) || 'U'}
        </Text>
      </View>
      <View style={styles.messageContent}>
        <View style={styles.messageHeader}>
          <Text style={styles.username}>{item.user.displayName}</Text>
          <Text style={styles.timestamp}>
            {new Date(item.createdAt).toLocaleTimeString()}
          </Text>
        </View>
        <Text style={styles.messageText}>{item.content}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.channelSelector}
          onPress={() => setShowChannels(!showChannels)}
        >
          <Ionicons name="menu" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Ionicons name="chatbubble" size={16} color="#71717a" />
          <Text style={styles.channelName}>
            {currentChannel?.name || 'Select channel'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Channel drawer */}
      {showChannels && (
        <View style={styles.channelDrawer}>
          <Text style={styles.channelDrawerTitle}>Channels</Text>
          {channels.map((channel) => (
            <TouchableOpacity
              key={channel.id}
              style={[
                styles.channelItem,
                currentChannel?.id === channel.id && styles.channelItemActive,
              ]}
              onPress={() => {
                setCurrentChannel(channel);
                setShowChannels(false);
              }}
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={currentChannel?.id === channel.id ? '#8b5cf6' : '#71717a'}
              />
              <Text
                style={[
                  styles.channelItemText,
                  currentChannel?.id === channel.id && styles.channelItemTextActive,
                ]}
              >
                {channel.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder={`Message #${currentChannel?.name || 'channel'}`}
            placeholderTextColor="#71717a"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, !messageInput.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!messageInput.trim()}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181b',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  channelSelector: {
    padding: 8,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  channelName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  channelDrawer: {
    backgroundColor: '#27272a',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f46',
  },
  channelDrawerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717a',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  channelItemActive: {
    backgroundColor: '#3f3f46',
  },
  channelItemText: {
    fontSize: 14,
    color: '#a1a1aa',
  },
  channelItemTextActive: {
    color: '#fff',
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  timestamp: {
    fontSize: 12,
    color: '#71717a',
  },
  messageText: {
    fontSize: 14,
    color: '#d4d4d8',
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#27272a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#fff',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#3f3f46',
  },
});
