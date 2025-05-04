import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import supabase from './src/lib/supabase';

/** Optional link attached to a message */
interface ChatDoc {
  title: string;
  url: string;
}

/** Shape of a single chat bubble */
interface ChatMessage {
  message: string;
  isUser: boolean;
  docs?: ChatDoc[];
}

/** Shape of what your Supabase Edge Function returns */
interface PromptResponse {
  message: string;
  docs?: ChatDoc[];
}

// Order from shortest to longest question
const SUGGESTIONS = [
  'How do I submit a project?',        // shortest
  'How do I initialize a project?',    
  'How do I set up my environment?',   // longest
];

export default function App() {
  const [query, setQuery] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Track whether we should show suggestions
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);

  // Handle text changes. Once the user types ANYTHING, hide suggestions for good.
  const handleInputChange = (text: string) => {
    setQuery(text);
    if (showSuggestions && text.length > 0) {
      setShowSuggestions(false);
    }
  };

  // Generic prompt runner; allows sending a custom query (for suggestions)
  const runPrompt = async (text?: string) => {
    const promptText = text ?? query;
    if (!promptText.trim()) return;

    // Hide suggestions once the user has sent a message
    setShowSuggestions(false);

    // Push the user’s message
    setMessages(curr => [{ message: promptText, isUser: true }, ...curr]);
    setQuery('');
    setLoading(true);

    // Hit the Supabase function
    const { data, error } = await supabase.functions.invoke<PromptResponse>(
      'prompt',
      { body: { query: promptText } }
    );

    setLoading(false);

    if (error) {
      console.log('Supabase invoke failed:', error);
      return;
    }

    // Push the assistant’s reply
    if (data) {
      setMessages(curr => [
        { message: data.message, isUser: false, docs: data.docs },
        ...curr,
      ]);
    }
  };

  // Called when user taps on a suggestion
  const handleSuggestionPress = async (suggestion: string) => {
    await runPrompt(suggestion);
  };

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageWrapper}>
      <Text
        style={[
          styles.username,
          item.isUser ? styles.userNameRight : styles.aiNameLeft,
        ]}
      >
        {item.isUser ? 'You' : 'CoPilot AI'}
      </Text>
      <View
        style={[
          item.isUser ? styles.userMessageContainer : styles.aiMessageContainer,
          item.isUser ? styles.userMessage : styles.aiMessage,
        ]}
      >
        <Markdown style={{ body: { color: '#2b3043' } }}>
          {item.message}
        </Markdown>
        {item.docs && !!item.docs.length && (
          <Text style={styles.docsTitle}>Read more:</Text>
        )}
        {item.docs?.map(doc => (
          <Pressable
            key={doc.url}
            style={styles.linkContainer}
            onPress={() => Linking.openURL(doc.url)}
          >
            <Text style={styles.link}>{doc.title}</Text>
            <Feather name="external-link" size={18} color="#5F2EE5" />
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 25}
      >
        <View style={styles.container}>
          {/* Chat list */}
          <FlatList
            data={messages}
            inverted
            keyExtractor={(_, i) => i.toString()}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            renderItem={renderItem}
          />

          {/* Vertical suggestion buttons (only visible if showSuggestions is true AND no messages exist). */}
          {showSuggestions && !messages.length && (
            <View style={styles.suggestionsContainer}>
              {SUGGESTIONS.map(suggestion => (
                <TouchableOpacity
                  key={suggestion}
                  style={styles.suggestionChip}
                  onPress={() => handleSuggestionPress(suggestion)}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              placeholder="Prompt"
              placeholderTextColor="lightgray"
              selectionColor="#5F2EE5"
              value={query}
              onChangeText={handleInputChange}
              style={styles.textInput}
              onSubmitEditing={() => runPrompt()}
            />
            <TouchableOpacity onPress={() => runPrompt()} style={styles.button}>
              <FontAwesome5 name="arrow-circle-up" size={30} color="#5F2EE5" />
            </TouchableOpacity>
          </View>

          {/* Centered loading indicator */}
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#5F2EE5" />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <StatusBar barStyle="default" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  listContainer: {
    gap: 10,
    paddingBottom: 100,
  },
  messageWrapper: {},
  username: {
    fontWeight: '700',
    marginBottom: 5,
  },
  userNameRight: {
    textAlign: 'right',
    color: '#2b3043',
  },
  aiNameLeft: {
    textAlign: 'left',
    color: '#5F2EE5',
  },
  userMessageContainer: {
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderBottomEndRadius: 0,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  aiMessageContainer: {
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderBottomStartRadius: 0,
    borderWidth: 1,
    borderColor: '#5F2EE550',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#ECECEC70',
    marginLeft: 40,
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#5F2EE510',
    marginRight: 40,
  },
  docsTitle: {
    fontWeight: 'bold',
    paddingTop: 10,
    color: '#5d6885',
  },
  linkContainer: {
    borderColor: 'gray',
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    marginVertical: 5,
    borderRadius: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: {
    fontWeight: '600',
    color: '#5F2EE5',
  },

  // Suggestions
  suggestionsContainer: {
    alignSelf: 'flex-start',
  },
  suggestionChip: {
    backgroundColor: '#5F2EE520',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
    borderBottomStartRadius: 0,
    marginBottom: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#5F2EE550',
  },
  suggestionText: {
    fontSize: 14,
    color: '#333',
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 18,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderColor: 'gainsboro',
    borderWidth: 1,
    borderRadius: 50,
  },
  button: {
    backgroundColor: 'white',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
