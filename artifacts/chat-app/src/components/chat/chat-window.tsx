import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { 
  useGetConversation, 
  useListMessages, 
  useSendMessage, 
  useMarkAllRead,
  useUploadMedia,
  getGetConversationQueryKey,
  getListMessagesQueryKey,
  Message
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, MoreVertical, Paperclip, Send, Search, FileIcon, X, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface ChatWindowProps {
  conversationId: number;
  onBack?: () => void;
}

export function ChatWindow({ conversationId, onBack }: ChatWindowProps) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const { data: conversation } = useGetConversation(conversationId);
  const { data: messages = [] } = useListMessages({ conversationId }, { query: { queryKey: getListMessagesQueryKey({ conversationId }) } });
  const sendMessageMutation = useSendMessage(conversationId);
  const markAllReadMutation = useMarkAllRead(conversationId);
  const uploadMediaMutation = useUploadMedia();

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark messages as read when viewing conversation
  useEffect(() => {
    if (conversationId && conversation?.unreadCount && conversation.unreadCount > 0) {
      markAllReadMutation.mutate(undefined, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(conversationId) });
          // Also invalidate list to update badge
          queryClient.invalidateQueries({ queryKey: [['/api/conversations']] });
        }
      });
    }
  }, [conversationId, conversation?.unreadCount]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMsg: Message) => {
      if (newMsg.conversationId === conversationId) {
        // Add to local cache
        queryClient.setQueryData(
          getListMessagesQueryKey({ conversationId }),
          (old: Message[] = []) => {
            // Check if already exists to prevent duplicates
            if (old.some(m => m.id === newMsg.id)) return old;
            return [...old, newMsg];
          }
        );
        
        // Mark as read if it's open
        if (newMsg.senderId !== user?.id) {
          markAllReadMutation.mutate();
        }
      }
    };

    const handleMessageStatus = (update: { messageId: number, status: string }) => {
      queryClient.setQueryData(
        getListMessagesQueryKey({ conversationId }),
        (old: Message[] = []) => old.map(m => 
          m.id === update.messageId ? { ...m, status: update.status as any } : m
        )
      );
    };

    const handleTypingStart = (data: { conversationId: number, userId: number }) => {
      if (data.conversationId === conversationId && data.userId !== user?.id) {
        setOtherUserTyping(true);
      }
    };

    const handleTypingStop = (data: { conversationId: number, userId: number }) => {
      if (data.conversationId === conversationId && data.userId !== user?.id) {
        setOtherUserTyping(false);
      }
    };

    const handleUserOnline = (data: { userId: number }) => {
      queryClient.setQueryData(getGetConversationQueryKey(conversationId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          participants: old.participants.map((p: any) => p.id === data.userId ? { ...p, isOnline: true } : p)
        };
      });
    };

    const handleUserOffline = (data: { userId: number, lastSeen: string }) => {
      queryClient.setQueryData(getGetConversationQueryKey(conversationId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          participants: old.participants.map((p: any) => p.id === data.userId ? { ...p, isOnline: false, lastSeen: data.lastSeen } : p)
        };
      });
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:status", handleMessageStatus);
    socket.on("typing:start", handleTypingStart);
    socket.on("typing:stop", handleTypingStop);
    socket.on("user:online", handleUserOnline);
    socket.on("user:offline", handleUserOffline);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:status", handleMessageStatus);
      socket.off("typing:start", handleTypingStart);
      socket.off("typing:stop", handleTypingStop);
      socket.off("user:online", handleUserOnline);
      socket.off("user:offline", handleUserOffline);
    };
  }, [socket, conversationId, user?.id, queryClient, markAllReadMutation]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    if (!isTyping && socket) {
      setIsTyping(true);
      socket.emit("typing:start", { conversationId });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (socket) {
        socket.emit("typing:stop", { conversationId });
      }
      setIsTyping(false);
    }, 1000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!message.trim() && !selectedFile) || sendMessageMutation.isPending || uploadMediaMutation.isPending) return;

    if (socket && isTyping) {
      socket.emit("typing:stop", { conversationId });
      setIsTyping(false);
    }

    let mediaUrl = null;
    let mediaType = null;

    if (selectedFile) {
      try {
        const uploadRes = await uploadMediaMutation.mutateAsync({ data: { file: selectedFile } });
        mediaUrl = uploadRes.url;
        mediaType = uploadRes.type;
        clearFile();
      } catch (err) {
        console.error("Failed to upload media", err);
        return;
      }
    }

    const content = message.trim();
    setMessage("");

    sendMessageMutation.mutate(
      { data: { content, mediaUrl, mediaType } },
      {
        onSuccess: (newMsg) => {
          queryClient.setQueryData(
            getListMessagesQueryKey({ conversationId }),
            (old: Message[] = []) => [...old, newMsg]
          );
        }
      }
    );
  };

  const getConversationName = () => {
    if (!conversation) return "Loading...";
    if (conversation.isGroup) return conversation.name || "Group Chat";
    const otherParticipant = conversation.participants.find(p => p.id !== user?.id);
    return otherParticipant?.name || "Unknown User";
  };

  const getConversationAvatar = () => {
    if (!conversation) return "";
    if (conversation.isGroup) return conversation.avatarUrl;
    const otherParticipant = conversation.participants.find(p => p.id !== user?.id);
    return otherParticipant?.avatarUrl;
  };

  const getOnlineStatus = () => {
    if (!conversation || conversation.isGroup) return null;
    const otherParticipant = conversation.participants.find(p => p.id !== user?.id);
    if (otherUserTyping) return "typing...";
    if (otherParticipant?.isOnline) return "online";
    if (otherParticipant?.lastSeen) return `last seen ${format(new Date(otherParticipant.lastSeen), "MMM d, HH:mm")}`;
    return null;
  };

  const MessageStatusIcon = ({ status, isMine }: { status: string, isMine: boolean }) => {
    if (!isMine) return null;
    
    if (status === 'sent') {
      return <span className="ml-1 text-gray-400 text-[10px]">✓</span>;
    } else if (status === 'delivered') {
      return <span className="ml-1 text-gray-400 text-[10px]">✓✓</span>;
    } else if (status === 'read') {
      return <span className="ml-1 text-blue-500 text-[10px]">✓✓</span>;
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#efeae2] relative">
      {/* Header */}
      <header className="h-16 bg-gray-50 border-b border-gray-200 flex items-center justify-between px-4 z-10 shrink-0">
        <div className="flex items-center">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="mr-2 -ml-2 rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          
          <Avatar className="h-10 w-10 mr-3 cursor-pointer">
            <AvatarImage src={getConversationAvatar() || ""} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {getConversationName().substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex flex-col cursor-pointer">
            <h2 className="text-base font-medium text-gray-900 leading-tight">{getConversationName()}</h2>
            <span className="text-xs text-primary h-4">{getOnlineStatus()}</span>
          </div>
        </div>
        
        <div className="flex items-center text-gray-500">
          <Button variant="ghost" size="icon" className="rounded-full hidden sm:inline-flex">
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:px-8 sm:py-6 relative z-0">
        <div className="flex flex-col space-y-2 max-w-3xl mx-auto">
          {/* Chat background pattern placeholder */}
          <div className="absolute inset-0 z-[-1] opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('https://static.whatsapp.net/rsrc.php/v4/yl/r/gi_DckOUM5a.png')" }}></div>
          
          {messages.map((msg, index) => {
            const isMine = msg.senderId === user?.id;
            const showAvatar = !isMine && (!messages[index - 1] || messages[index - 1].senderId !== msg.senderId);
            const isFirstInSequence = !messages[index - 1] || messages[index - 1].senderId !== msg.senderId;

            return (
              <div 
                key={msg.id} 
                className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isFirstInSequence ? 'mt-2' : 'mt-[2px]'}`}
              >
                {!isMine && conversation?.isGroup && (
                  <div className="w-8 flex-shrink-0 mr-2 flex items-end">
                    {showAvatar && (
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={msg.sender.avatarUrl || ""} />
                        <AvatarFallback className="text-[10px] bg-blue-100 text-blue-600">
                          {msg.sender.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                )}
                
                <div 
                  className={`max-w-[75%] px-3 py-1.5 rounded-lg shadow-sm relative flex flex-col ${
                    isMine 
                      ? 'bg-[#dcf8c6] text-gray-900 rounded-tr-none' 
                      : 'bg-white text-gray-900 rounded-tl-none'
                  }`}
                >
                  {!isMine && conversation?.isGroup && isFirstInSequence && (
                    <div className="text-xs font-medium text-primary mb-1">{msg.sender.name}</div>
                  )}
                  
                  {msg.mediaUrl && (
                    <div className="mb-1 mt-1 overflow-hidden rounded-md max-w-full">
                      {msg.mediaType?.startsWith('image/') ? (
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                          <img src={msg.mediaUrl} alt="Attached media" className="max-w-full h-auto max-h-64 object-cover rounded-md" />
                        </a>
                      ) : (
                        <a 
                          href={msg.mediaUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center p-3 bg-black/5 rounded-md hover:bg-black/10 transition-colors"
                        >
                          <FileIcon className="h-8 w-8 mr-3 text-gray-500" />
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-medium truncate">Attachment</span>
                            <span className="text-xs text-gray-500 uppercase">{msg.mediaType?.split('/')[1] || 'File'}</span>
                          </div>
                        </a>
                      )}
                    </div>
                  )}

                  {msg.content && (
                    <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  )}
                  
                  <div className={`flex items-center justify-end space-x-1 float-right ml-3 pt-1 ${(msg.mediaUrl && !msg.content) ? 'mt-1' : '-mt-1'}`}>
                    <span className="text-[10px] text-gray-500 leading-none">
                      {format(new Date(msg.createdAt), "HH:mm")}
                    </span>
                    <MessageStatusIcon status={msg.status} isMine={isMine} />
                  </div>
                </div>
              </div>
            );
          })}
          
          {otherUserTyping && (
            <div className="flex justify-start mt-2">
              <div className="bg-white rounded-lg rounded-tl-none px-4 py-2 shadow-sm flex items-center space-x-1">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Selected File Preview */}
      {selectedFile && (
        <div className="bg-gray-100 p-4 border-t border-gray-200 flex items-center relative z-10">
          <div className="relative inline-block">
            <Button 
              variant="destructive" 
              size="icon" 
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full z-10 shadow-sm"
              onClick={clearFile}
            >
              <X className="h-4 w-4" />
            </Button>
            {previewUrl ? (
              <div className="h-20 w-20 rounded-lg overflow-hidden border border-gray-300 shadow-sm bg-white">
                <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="h-20 w-20 rounded-lg border border-gray-300 shadow-sm bg-white flex flex-col items-center justify-center p-2 text-gray-500">
                <FileIcon className="h-8 w-8 mb-1" />
                <span className="text-[10px] truncate w-full text-center">{selectedFile.name}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-[#f0f2f5] px-4 py-3 flex items-end space-x-2 z-10 shrink-0 relative">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          className="hidden" 
        />
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full text-gray-500 shrink-0 mb-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <form onSubmit={handleSendMessage} className="flex-1 flex items-end">
          <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden flex min-h-[44px] max-h-[120px]">
            <textarea
              value={message}
              onChange={(e) => {
                handleTyping(e);
                // Auto-resize
                e.target.style.height = '44px';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder="Type a message"
              className="w-full py-2.5 px-4 bg-transparent resize-none outline-none text-[15px] max-h-[120px]"
              rows={1}
              style={{ minHeight: '44px' }}
            />
          </div>
          <Button 
            type="submit" 
            variant="ghost" 
            size="icon" 
            className={`rounded-full ml-2 shrink-0 mb-1 transition-colors ${(message.trim() || selectedFile) ? 'text-primary' : 'text-gray-500'}`}
            disabled={(!message.trim() && !selectedFile) || sendMessageMutation.isPending || uploadMediaMutation.isPending}
          >
            {(sendMessageMutation.isPending || uploadMediaMutation.isPending) ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

