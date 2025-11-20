import React, { useRef, useEffect } from 'react';
import { BoldIcon, ItalicIcon, UnderlineIcon, AlignLeftIcon, AlignCenterIcon, AlignRightIcon } from '../icons';

const RichTextEditor = ({ value, onChange }) => {
    const editorRef = useRef(null);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value || '<p><br></p>';
        }
    }, [value]);

    const handleInput = (e) => {
        onChange(e.target.innerHTML);
    };
    
    const handleCommand = (command, arg = null) => {
        document.execCommand(command, false, arg);
        editorRef.current.focus();
        onChange(editorRef.current.innerHTML);
    };

    return (
        <div className="border border-gray-300 rounded-md bg-white text-gray-800">
            <div className="flex items-center p-1 border-b border-gray-200 space-x-1">
                <select onChange={(e) => handleCommand('fontName', e.target.value)} className="text-xs bg-gray-100 border-gray-300 rounded-md p-1 focus:ring-sky-500 focus:outline-none">
                    <option value="Inter">Inter</option>
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Verdana">Verdana</option>
                </select>
                <button type="button" onClick={() => handleCommand('bold')} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-gray-600"><BoldIcon /></button>
                <button type="button" onClick={() => handleCommand('italic')} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-gray-600"><ItalicIcon /></button>
                <button type="button" onClick={() => handleCommand('underline')} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-gray-600"><UnderlineIcon /></button>
                <button type="button" onClick={() => handleCommand('justifyLeft')} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-gray-600"><AlignLeftIcon /></button>
                <button type="button" onClick={() => handleCommand('justifyCenter')} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-gray-600"><AlignCenterIcon /></button>
                <button type="button" onClick={() => handleCommand('justifyRight')} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-gray-600"><AlignRightIcon /></button>
            </div>
            <div
                ref={editorRef}
                onInput={handleInput}
                contentEditable={true}
                className="p-2 min-h-[100px] focus:outline-none prose prose-sm max-w-none"
            />
        </div>
    );
};

export default RichTextEditor;
