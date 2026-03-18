import { DeliveryJobStatus } from "@prisma/client";

export const statusOrder: DeliveryJobStatus[] = [
  DeliveryJobStatus.uploaded,
  DeliveryJobStatus.queued,
  DeliveryJobStatus.compressing,
  DeliveryJobStatus.extracting_audio,
  DeliveryJobStatus.transcribing,
  DeliveryJobStatus.sampling_frames,
  DeliveryJobStatus.generating_coaching,
  DeliveryJobStatus.complete
];

export const statusLabels: Record<DeliveryJobStatus, string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  compressing: "Compressing",
  extracting_audio: "Extracting audio",
  transcribing: "Transcribing",
  sampling_frames: "Sampling frames",
  generating_coaching: "Generating coaching",
  complete: "Complete",
  failed: "Failed"
};

export function isTerminalStatus(status: DeliveryJobStatus) {
  return status === DeliveryJobStatus.complete || status === DeliveryJobStatus.failed;
}
