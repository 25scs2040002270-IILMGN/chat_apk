import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { Sidebar } from "@/components/chat/sidebar";
import { ChatWindow } from "@/components/chat/chat-window";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Home() {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const isMobile = useIsMobile();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  const handleSelectConversation = (id: number) => {
    setActiveConversationId(id);
  };

  const handleBack = () => {
    setActiveConversationId(null);
  };

  if (!user) return null;

  const showSidebar = !isMobile || activeConversationId === null;
  const showChat = !isMobile || activeConversationId !== null;

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden">
      {showSidebar && (
        <div className={`${isMobile ? "w-full" : "w-80 lg:w-96"} flex-shrink-0 border-r border-gray-200 bg-white flex flex-col`}>
          <Sidebar 
            activeConversationId={activeConversationId} 
            onSelectConversation={handleSelectConversation} 
          />
        </div>
      )}
      
      {showChat && (
        <div className="flex-1 flex flex-col bg-[#efeae2] relative h-full">
          {activeConversationId ? (
            <ChatWindow 
              conversationId={activeConversationId} 
              onBack={isMobile ? handleBack : undefined} 
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <h2 className="text-2xl font-light text-gray-800 mb-2">ChatApp Web</h2>
              <p className="text-gray-500 max-w-md">Send and receive messages without keeping your phone online. Use ChatApp on up to 4 linked devices and 1 phone at the same time.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
