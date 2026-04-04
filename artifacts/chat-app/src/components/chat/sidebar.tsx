import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useListConversations, ConversationWithMeta, getListConversationsQueryKey } from "@workspace/api-client-react";
import { useSocket } from "@/hooks/use-socket";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquarePlus, Search, MoreVertical, Settings } from "lucide-react";
import { formatDistanceToNow, isToday, format } from "date-fns";
import { SearchModal } from "./search-modal";

interface SidebarProps {
  activeConversationId: number | null;
  onSelectConversation: (id: number) => void;
}

export function Sidebar({ activeConversationId, onSelectConversation }: SidebarProps) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const { data: conversations = [], isLoading } = useListConversations();

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = () => {
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    };

    socket.on("message:new", handleNewMessage);
    
    return () => {
      socket.off("message:new", handleNewMessage);
    };
  }, [socket, queryClient]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    
    return conversations.filter(conv => {
      const name = conv.isGroup 
        ? conv.name 
        : conv.participants.find(p => p.id !== user?.id)?.name;
      
      return name?.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [conversations, searchQuery, user]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return format(date, "HH:mm");
    }
    return formatDistanceToNow(date, { addSuffix: false }).split(" ")[0] + " " + formatDistanceToNow(date, { addSuffix: false }).split(" ")[1].charAt(0);
  };

  const getConversationName = (conv: ConversationWithMeta) => {
    if (conv.isGroup) return conv.name || "Group Chat";
    const otherParticipant = conv.participants.find(p => p.id !== user?.id);
    return otherParticipant?.name || "Unknown User";
  };

  const getConversationAvatar = (conv: ConversationWithMeta) => {
    if (conv.isGroup) return conv.avatarUrl;
    const otherParticipant = conv.participants.find(p => p.id !== user?.id);
    return otherParticipant?.avatarUrl;
  };

  const getOtherParticipant = (conv: ConversationWithMeta) => {
    return conv.participants.find(p => p.id !== user?.id);
  };

  return (
    <>
      <div className="h-16 flex items-center justify-between px-4 bg-gray-50 border-b border-gray-200">
        <Link href="/profile">
          <Avatar className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity">
            <AvatarImage src={user?.avatarUrl || ""} />
            <AvatarFallback className="bg-primary/20 text-primary">{user?.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex items-center space-x-2 text-gray-500">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setIsSearchModalOpen(true)}>
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="p-2 bg-white border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search or start new chat" 
            className="pl-10 bg-gray-100 border-none h-9 rounded-lg"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <div className="h-12 w-12 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            {searchQuery ? "No chats found." : "No conversations yet. Click the + button to start chatting."}
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredConversations.map((conv) => {
              const name = getConversationName(conv);
              const avatar = getConversationAvatar(conv);
              const otherUser = getOtherParticipant(conv);
              const isOnline = !conv.isGroup && otherUser?.isOnline;
              const isActive = activeConversationId === conv.id;

              return (
                <div 
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${isActive ? 'bg-gray-100' : ''}`}
                >
                  <div className="relative mr-4 flex-shrink-0">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={avatar || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col justify-center border-b border-gray-100 pb-2 -mb-2 h-14">
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="text-base font-medium text-gray-900 truncate pr-2">{name}</h3>
                      {conv.lastMessage && (
                        <span className={`text-xs flex-shrink-0 ${conv.unreadCount > 0 ? 'text-primary font-medium' : 'text-gray-400'}`}>
                          {formatTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-500 truncate pr-2">
                        {conv.lastMessage ? (
                          <>
                            {conv.lastMessage.senderId === user?.id && "You: "}
                            {conv.lastMessage.content || "Media message"}
                          </>
                        ) : "No messages yet"}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="bg-primary text-white text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <SearchModal 
        isOpen={isSearchModalOpen} 
        onClose={() => setIsSearchModalOpen(false)} 
        onSelect={(convId) => {
          onSelectConversation(convId);
          setIsSearchModalOpen(false);
        }}
      />
    </>
  );
}
