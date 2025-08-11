"use client"

import { useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, Wand2, ImageIcon, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import React from "react"

interface ProfileImagePickerProps {
  children?: React.ReactNode;
  agentId: string;
  currentImageUrl?: string;
  onImageChange: (imageUrl: string | null) => void;
}

export const ProfileImagePicker = ({ 
  children, 
  agentId, 
  currentImageUrl,
  onImageChange 
}: ProfileImagePickerProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(currentImageUrl || null)
  const [aiPrompt, setAiPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Update local state when props change
  React.useEffect(() => {
    setSelectedImage(currentImageUrl || null);
  }, [currentImageUrl]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('agent_id', agentId);

      // TODO: Replace with actual upload endpoint
      const response = await fetch('/api/agents/upload-profile-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload image');
      }

      const result = await response.json();
      setSelectedImage(result.image_url);
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [agentId]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleAIGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) {
      toast.error('Please enter a description for the AI to generate an image');
      return;
    }

    setIsGenerating(true);
    try {
      // TODO: Replace with actual AI generation endpoint
      const response = await fetch('/api/agents/generate-profile-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: agentId,
          prompt: aiPrompt.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate image');
      }

      const result = await response.json();
      setSelectedImage(result.image_url);
      toast.success('AI image generated successfully');
      setAiPrompt("");
    } catch (error) {
      console.error('AI generation error:', error);
      toast.error('Failed to generate AI image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [agentId, aiPrompt]);

  const handleSubmit = useCallback(() => {
    onImageChange(selectedImage);
    setIsOpen(false);
  }, [selectedImage, onImageChange]);

  const handleRemove = useCallback(() => {
    setSelectedImage(null);
  }, []);

  const handleReset = useCallback(() => {
    setSelectedImage(currentImageUrl || null);
    setAiPrompt("");
  }, [currentImageUrl]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {children || (
          <Button variant="outline" className="h-12 w-12 rounded-lg p-0">
            {selectedImage ? (
              <img 
                src={selectedImage} 
                alt="Profile" 
                className="h-full w-full object-cover rounded-lg"
              />
            ) : (
              <ImageIcon className="h-5 w-5" />
            )}
          </Button>
        )}
      </PopoverTrigger>
      
      <PopoverContent className="w-96 p-0" align="start">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Agent Profile Image</CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload" className="text-xs">
                  <Upload className="w-3 h-3 mr-1" />
                  Upload
                </TabsTrigger>
                <TabsTrigger value="ai" className="text-xs">
                  <Wand2 className="w-3 h-3 mr-1" />
                  AI Generate
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="image-upload" className="text-sm font-medium">
                    Upload Image
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      variant="outline"
                      className="flex-1"
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      {isUploading ? 'Uploading...' : 'Choose File'}
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <p className="text-xs text-muted-foreground">
                    Supports JPG, PNG, GIF up to 5MB
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="ai" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ai-prompt" className="text-sm font-medium">
                    Describe the agent
                  </Label>
                  <Input
                    id="ai-prompt"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. A friendly robot assistant with blue colors"
                    disabled={isGenerating}
                  />
                  <Button
                    onClick={handleAIGenerate}
                    disabled={isGenerating || !aiPrompt.trim()}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-2" />
                    )}
                    {isGenerating ? 'Generating...' : 'Generate with AI'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {selectedImage && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Preview</Label>
                <div className="relative">
                  <img 
                    src={selectedImage} 
                    alt="Selected profile" 
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <Button
                    onClick={handleRemove}
                    size="sm"
                    variant="destructive"
                    className="absolute top-2 right-2 h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            <div className="flex gap-2">
              <Button
                onClick={handleReset}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Reset
              </Button>
              <Button
                onClick={handleSubmit}
                size="sm"
                className="flex-1"
                disabled={selectedImage === currentImageUrl}
              >
                Apply
              </Button>
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
} 