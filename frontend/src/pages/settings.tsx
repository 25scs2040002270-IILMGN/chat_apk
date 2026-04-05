import { Link } from "wouter";
import { ArrowLeft, Monitor, Moon, Sun, Type, Palette, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, THEME_PRESETS, CHAT_BG_PRESETS } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary text-white px-4 shadow-sm flex items-center space-x-4 h-16">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-medium">Chat Settings</h1>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-8 space-y-6">

        {/* Color Theme */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center space-x-3 px-6 py-4 border-b border-gray-100">
            <Palette className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-gray-900">App Color Theme</h2>
          </div>
          <div className="p-6 grid grid-cols-3 gap-3">
            {THEME_PRESETS.map((preset) => {
              const isActive = theme.primaryHsl === preset.primaryHsl;
              return (
                <button
                  key={preset.name}
                  onClick={() => setTheme({ primaryHsl: preset.primaryHsl, myBubbleBg: preset.myBubbleBg })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                    isActive ? "border-primary shadow-md" : "border-transparent hover:border-gray-200"
                  )}
                >
                  <div
                    className="w-10 h-10 rounded-full shadow-sm ring-2 ring-white ring-offset-1"
                    style={{ backgroundColor: preset.accent }}
                  />
                  <span className="text-xs font-medium text-gray-700">{preset.name}</span>
                  {isActive && (
                    <span className="text-[10px] text-primary font-semibold">Active</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Chat Background */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center space-x-3 px-6 py-4 border-b border-gray-100">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-gray-900">Chat Background</h2>
          </div>
          <div className="p-6 grid grid-cols-4 gap-3">
            {CHAT_BG_PRESETS.map((bg) => {
              const isActive = theme.chatBg === bg.value;
              return (
                <button
                  key={bg.name}
                  onClick={() => setTheme({ chatBg: bg.value })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all",
                    isActive ? "border-primary shadow-md" : "border-transparent hover:border-gray-200"
                  )}
                >
                  <div
                    className="w-12 h-12 rounded-lg shadow-sm border border-gray-200"
                    style={{ backgroundColor: bg.value }}
                  />
                  <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">{bg.name}</span>
                </button>
              );
            })}
          </div>
          <div className="px-6 pb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Custom Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.chatBg}
                onChange={(e) => setTheme({ chatBg: e.target.value })}
                className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 p-0.5"
              />
              <span className="text-sm text-gray-500 font-mono">{theme.chatBg}</span>
            </div>
          </div>
        </section>

        {/* Message Bubble Color */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center space-x-3 px-6 py-4 border-b border-gray-100">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-gray-900">My Message Bubble Color</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-6 mb-4">
              {["#dcf8c6", "#c8e6ff", "#e8d5ff", "#ffd5e0", "#fff0c8", "#d0f0c8", "#ffe4c4", "#e0e0e0"].map((color) => (
                <button
                  key={color}
                  onClick={() => setTheme({ myBubbleBg: color })}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 shadow-sm transition-transform hover:scale-110",
                    theme.myBubbleBg === color ? "border-primary scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.myBubbleBg}
                onChange={(e) => setTheme({ myBubbleBg: e.target.value })}
                className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 p-0.5"
              />
              <span className="text-sm text-gray-500 font-mono">{theme.myBubbleBg}</span>
            </div>
            {/* Preview */}
            <div className="mt-4 p-4 rounded-xl border border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400 mb-2">Preview</p>
              <div className="flex justify-end">
                <div
                  className="px-3 py-2 rounded-lg rounded-tr-none text-sm text-gray-800 shadow-sm max-w-[70%]"
                  style={{ backgroundColor: theme.myBubbleBg }}
                >
                  Hey, how are you? 😊
                </div>
              </div>
              <div className="flex justify-start mt-2">
                <div className="px-3 py-2 rounded-lg rounded-tl-none text-sm text-gray-800 shadow-sm bg-white max-w-[70%]">
                  I'm doing great, thanks!
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Font Size */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center space-x-3 px-6 py-4 border-b border-gray-100">
            <Type className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-gray-900">Message Font Size</h2>
          </div>
          <div className="p-6 flex gap-3">
            {(["sm", "md", "lg"] as const).map((size) => {
              const labels = { sm: "Small", md: "Medium", lg: "Large" };
              const sizes = { sm: "text-xs", md: "text-sm", lg: "text-base" };
              return (
                <button
                  key={size}
                  onClick={() => setTheme({ fontSize: size })}
                  className={cn(
                    "flex-1 flex flex-col items-center py-4 rounded-xl border-2 transition-all",
                    theme.fontSize === size ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <span className={cn("font-medium text-gray-800", sizes[size])}>{labels[size]}</span>
                  <span className={cn("text-gray-400 mt-1", sizes[size])}>Aa</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Dark Mode */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center space-x-3 px-6 py-4 border-b border-gray-100">
            <Monitor className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-gray-900">Appearance</h2>
          </div>
          <div className="p-6 flex gap-3">
            <button
              onClick={() => setTheme({ darkMode: false })}
              className={cn(
                "flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all",
                !theme.darkMode ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
              )}
            >
              <Sun className="h-6 w-6 text-amber-500" />
              <span className="text-sm font-medium text-gray-700">Light</span>
            </button>
            <button
              onClick={() => setTheme({ darkMode: true })}
              className={cn(
                "flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all",
                theme.darkMode ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
              )}
            >
              <Moon className="h-6 w-6 text-indigo-500" />
              <span className="text-sm font-medium text-gray-700">Dark</span>
            </button>
          </div>
        </section>

        {/* Reset */}
        <div className="flex justify-center pb-4">
          <Button
            variant="outline"
            className="text-gray-500"
            onClick={() => setTheme({
              primaryHsl: "173 100% 24%",
              chatBg: "#efeae2",
              myBubbleBg: "#dcf8c6",
              darkMode: false,
              fontSize: "md",
            })}
          >
            Reset to Defaults
          </Button>
        </div>
      </main>
    </div>
  );
}
