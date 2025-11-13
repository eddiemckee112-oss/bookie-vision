import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon, Monitor, Check } from "lucide-react";

const accentColors = [
  { value: "blue", label: "Blue", class: "bg-[hsl(217,91%,60%)]" },
  { value: "green", label: "Green", class: "bg-[hsl(142,71%,45%)]" },
  { value: "purple", label: "Purple", class: "bg-[hsl(262,83%,58%)]" },
  { value: "orange", label: "Orange", class: "bg-[hsl(25,95%,53%)]" },
  { value: "red", label: "Red", class: "bg-[hsl(0,72%,51%)]" },
  { value: "pink", label: "Pink", class: "bg-[hsl(330,81%,60%)]" },
  { value: "teal", label: "Teal", class: "bg-[hsl(180,77%,47%)]" },
  { value: "amber", label: "Amber", class: "bg-[hsl(45,93%,53%)]" },
];

export function AppearanceSettings() {
  const { theme, accent, setTheme, setAccent } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Customize how the app looks and feels</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Theme</Label>
          <RadioGroup value={theme} onValueChange={(value) => setTheme(value as any)}>
            <div className="flex items-center space-x-2 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="light" id="light" />
              <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer flex-1">
                <Sun className="h-4 w-4" />
                <div>
                  <div className="font-medium">Light</div>
                  <div className="text-xs text-muted-foreground">Bright and clean appearance</div>
                </div>
              </Label>
            </div>
            
            <div className="flex items-center space-x-2 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="dark" id="dark" />
              <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer flex-1">
                <Moon className="h-4 w-4" />
                <div>
                  <div className="font-medium">Dark</div>
                  <div className="text-xs text-muted-foreground">Easy on the eyes in low light</div>
                </div>
              </Label>
            </div>
            
            <div className="flex items-center space-x-2 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="system" id="system" />
              <Label htmlFor="system" className="flex items-center gap-2 cursor-pointer flex-1">
                <Monitor className="h-4 w-4" />
                <div>
                  <div className="font-medium">System</div>
                  <div className="text-xs text-muted-foreground">Follows your device preference</div>
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Accent Color Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Accent Color</Label>
          <div className="grid grid-cols-4 gap-3">
            {accentColors.map((color) => (
              <button
                key={color.value}
                onClick={() => setAccent(color.value as any)}
                className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/50 transition-all group"
                aria-label={`Select ${color.label} accent`}
              >
                <div className={`w-10 h-10 rounded-full ${color.class} flex items-center justify-center transition-transform group-hover:scale-110`}>
                  {accent === color.value && (
                    <Check className="h-5 w-5 text-white" />
                  )}
                </div>
                <span className="text-xs font-medium">{color.label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
