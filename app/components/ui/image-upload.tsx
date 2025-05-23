import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button'; // Assuming Button component exists
import { X as XIcon, UploadCloud } from 'lucide-react'; // Icons for clear and placeholder
import { cn } from '@/lib/utils'; // For conditional classnames

interface ImageUploadProps {
  onFileChange: (files: File[]) => void; // Changed to File[]
  maxSizeMB?: number; 
  className?: string;
  id?: string;
  name?: string;
}

export interface ImageUploadRef {
  clear: () => void;
}

const ImageUpload = React.forwardRef<ImageUploadRef, ImageUploadProps>(
  ({ onFileChange, maxSizeMB = 10, className, id, name }, ref) => { // Default value set to 10
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]); // Changed to File[]
    const [errors, setErrors] = useState<string[]>([]); // Changed to string[] for multiple errors
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const clearAllFiles = useCallback(() => {
      setSelectedFiles([]);
      setErrors([]);
      onFileChange([]);
      if (inputRef.current) {
        inputRef.current.value = ''; 
      }
    }, [onFileChange]);

    React.useImperativeHandle(ref, () => ({
      clear: clearAllFiles,
    }));

    const processFiles = (filesToProcess: FileList | File[]) => {
      const newValidFiles: File[] = [...selectedFiles];
      const newErrors: string[] = [];
      
      Array.from(filesToProcess).forEach(file => {
        // Check for duplicates by name and size (simple check)
        if (newValidFiles.some(f => f.name === file.name && f.size === file.size)) {
          // Optionally add an error or notification for duplicate
          // newErrors.push(`Le fichier "${file.name}" est déjà sélectionné.`);
          return; 
        }

        if (file.size > maxSizeMB * 1024 * 1024) {
          newErrors.push(`"${file.name}" est trop volumineux (max ${maxSizeMB}MB).`);
        } else if (!file.type.startsWith('image/')) {
          newErrors.push(`"${file.name}" n'est pas un type d'image valide.`);
        }
         else {
          newValidFiles.push(file);
        }
      });

      setSelectedFiles(newValidFiles);
      setErrors(newErrors);
      onFileChange(newValidFiles);
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        processFiles(event.target.files);
      }
      // Reset input value to allow selecting the same file again after removing it
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    };

    const removeFile = (fileToRemove: File) => {
      const updatedFiles = selectedFiles.filter(file => file !== fileToRemove);
      setSelectedFiles(updatedFiles);
      onFileChange(updatedFiles);
      // If all files are removed, clear errors related to general selection
      if (updatedFiles.length === 0) {
        setErrors([]);
      }
    };

    const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      if (event.dataTransfer.files) {
        processFiles(event.dataTransfer.files);
      }
    },
    [maxSizeMB, onFileChange, selectedFiles] // Added selectedFiles
  );

  const triggerFileInput = () => {
    inputRef.current?.click();
  };

  return (
    <div className={cn('space-y-2 w-full', className)}>
      <div
        id={id}
        className={cn(
          'flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-md cursor-pointer hover:border-primary/70 transition-colors',
          isDragging ? 'border-primary bg-primary/10' : 'border-gray-300 dark:border-gray-600',
          error ? 'border-red-500' : '',
          selectedFile && !error ? 'border-green-500' : ''
        )}
        onClick={triggerFileInput}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-labelledby={id ? `${id}-label` : undefined}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple // Added multiple attribute
          name={name} 
          onChange={handleFileChange}
          className="hidden"
          id={id ? `${id}-input` : undefined}
        />
        {selectedFiles.length === 0 ? (
          <div className="text-center">
            <UploadCloud className="mx-auto h-10 w-10 text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold text-primary">Cliquez pour choisir</span> ou glissez-déposez des images
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              PNG, JPG, GIF, WEBP jusqu'à {maxSizeMB}MB chacun
            </p>
          </div>
        ) : (
          <div className="w-full">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              Fichiers sélectionnés ({selectedFiles.length}):
            </p>
            <ul className="space-y-1 text-xs list-disc list-inside">
              {selectedFiles.map((file, index) => (
                <li key={index} className="flex justify-between items-center">
                  <span>
                    {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                  <Button
                    variant="ghost"
                    size="icon_sm"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering file input
                      removeFile(file);
                    }}
                    className="text-red-500 hover:text-red-700"
                    aria-label={`Retirer ${file.name}`}
                  >
                    <XIcon className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {selectedFiles.length > 0 && (
         <div className="flex justify-end mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); clearAllFiles();}}
              className="text-xs"
            >
              Retirer tous les fichiers
            </Button>
          </div>
      )}

      {errors.length > 0 && (
        <div className="mt-2 space-y-1">
          {errors.map((err, index) => (
            <p key={index} className="text-sm text-red-600">{err}</p>
          ))}
        </div>
      )}
    </div>
  );
  }
);

ImageUpload.displayName = 'ImageUpload';
export default ImageUpload;
