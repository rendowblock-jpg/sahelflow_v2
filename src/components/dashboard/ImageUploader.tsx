"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Upload, X, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ImageUploaderProps {
	value: string;
	onChange: (url: string) => void;
	onUpload: (file: File) => Promise<string>;
}

export default function ImageUploader({
	value,
	onChange,
	onUpload,
}: ImageUploaderProps) {
	const { t } = useI18n();
	const [dragging, setDragging] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState("");
	const [preview, setPreview] = useState<string | null>(value || null);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFile = useCallback(
		async (file: File) => {
			if (!file.type.startsWith("image/")) {
				setError(t.products.uploadInvalidType);
				return;
			}
			if (file.size > 5 * 1024 * 1024) {
				setError(t.products.uploadTooLarge);
				return;
			}
			setError("");
			setUploading(true);

			const reader = new FileReader();
			reader.onload = (e) => setPreview(e.target?.result as string);
			reader.readAsDataURL(file);

			try {
				const url = await onUpload(file);
				onChange(url);
			} catch (e: unknown) {
				setError(
					e instanceof Error ? e.message : String(e) || t.products.uploadError,
				);
				setPreview(value || null);
			} finally {
				setUploading(false);
			}
		},
		[onUpload, onChange, value, t],
	);

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setDragging(false);
		const file = e.dataTransfer.files[0];
		if (file) handleFile(file);
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();
		setDragging(true);
	}

	function handleDragLeave() {
		setDragging(false);
	}

	function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) handleFile(file);
	}

	function handleRemove() {
		setPreview(null);
		onChange("");
		setError("");
		if (inputRef.current) inputRef.current.value = "";
	}

	return (
		<div>
			<label className="sf-label">{t.products.productImage}</label>
			{preview ? (
				<div className="sf-image-uploader__preview">
					<Image
						src={preview}
						alt="Product"
						width={200}
						height={200}
						className="sf-image-uploader__img"
						unoptimized
					/>
					<div className="sf-image-uploader__preview-actions">
						{uploading && (
							<div className="sf-image-uploader__overlay">
								<Loader2
									size={24}
									style={{ animation: "spin 1s linear infinite" }}
								/>
							</div>
						)}
						<button
							type="button"
							onClick={handleRemove}
							className="sf-image-uploader__remove"
							aria-label={t.products.removeImage}
							disabled={uploading}
						>
							<X size={14} />
						</button>
					</div>
				</div>
			) : (
				<div
					className={`sf-image-uploader ${dragging ? "sf-image-uploader--dragging" : ""}`}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onClick={() => inputRef.current?.click()}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
					}}
				>
					{uploading ? (
						<Loader2
							size={28}
							style={{
								animation: "spin 1s linear infinite",
								color: "var(--color-brand-400)",
							}}
						/>
					) : (
						<>
							<Upload
								size={28}
								style={{
									color: "var(--color-content-tertiary)",
									marginBottom: 8,
								}}
							/>
							<p
								style={{
									fontSize: 13,
									color: "var(--color-content-secondary)",
									marginBottom: 4,
								}}
							>
								{t.products.uploadDragDrop}
							</p>
							<p
								style={{ fontSize: 11, color: "var(--color-content-tertiary)" }}
							>
								{t.products.uploadClick}
							</p>
						</>
					)}
				</div>
			)}
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				onChange={handleInputChange}
				style={{ display: "none" }}
			/>
			{error && (
				<p
					style={{
						fontSize: 12,
						color: "var(--color-danger-400)",
						marginTop: 6,
					}}
				>
					{error}
				</p>
			)}
		</div>
	);
}
