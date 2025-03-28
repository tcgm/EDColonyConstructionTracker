import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

const EDDropzone = ({ onFilesAdded }) => {
    const onDrop = useCallback((acceptedFiles) => {
        if (onFilesAdded) {
            onFilesAdded(acceptedFiles);
        }
    }, [onFilesAdded]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

    return (
        <div
            {...getRootProps()}
            style={{
                border: '2px dashed #666',
                borderRadius: '4px',
                padding: '1px',
                marginTop: '4px',
                textAlign: 'center',
                cursor: 'pointer',
                width: '100%',
                backgroundColor: isDragActive ? '#333' : '#222',
                color: '#fff',
                height: "32px",
                lineHeight: '24px',
            }}
        >
            <input {...getInputProps()} />
            {isDragActive ? (
                <p>Drop the screenshots here...</p>
            ) : (
                <p>Drag & drop screenshots here{/*, or click to select files */}</p>
            )}
        </div>
    );
};

export default EDDropzone;