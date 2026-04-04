import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSearchUsers, useCreateConversation, getListConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (conversationId: number) => void;
}

export function SearchModal({ isOpen, onClose, onSelect }: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const queryClient = useQueryClient();
  
  const { data: users = [], isLoading } = useSearchUsers(
    { q: debouncedQuery }, 
    { query: { enabled: isOpen && debouncedQuery.length > 0 } }
  );

  const createConversationMutation = useCreateConversation();

  // Reset search when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  const handleSelectUser = (userId: number) => {
    createConversationMutation.mutate(
      { data: { participantIds: [userId] } },
      {
        onSuccess: (conversation) => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          onSelect(conversation.id);
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <DialogTitle>New Chat</DialogTitle>
        </DialogHeader>
        
        <div className="p-3 border-b border-gray-100 relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by name or email..."
            className="pl-10 bg-gray-50 border-gray-200 focus-visible:ring-primary/20"
            autoFocus
          />
        </div>

        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
            </div>
          ) : users.length > 0 ? (
            <div className="flex flex-col py-2">
              {users.map(user => (
                <div 
                  key={user.id}
                  onClick={() => handleSelectUser(user.id)}
                  className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <Avatar className="h-10 w-10 mr-3">
                    <AvatarImage src={user.avatarUrl || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate">{user.name}</span>
                  </div>
                  {user.isOnline && (
                    <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  )}
                </div>
              ))}
            </div>
          ) : debouncedQuery ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              No users found matching "{debouncedQuery}"
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              Type to search for users
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
