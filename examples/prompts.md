# Example Prompts for MCP Hosts

These prompts are written for Claude Desktop, Cursor, Windsurf, and other
MCP-compatible agents that have the `junglegrid` server enabled.

## Estimate a Job Before Submission

```text
Estimate the cost of running a batch job with image nvidia/cuda:12.2.0-base-ubuntu22.04 and command ["bash","-lc","python train.py --epochs 3"]. Use routing_mode "cost" and explain whether the estimate confirms immediate capacity or only supported/provisionable capacity.
```

## Submit a Managed Batch Job

```text
Submit a batch job named "mnist-train" using image pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime with command ["python","train.py","--epochs","5"]. After submission, tell me the job id and next tool to call.
```

## Check Job Status

```text
Check the status of Jungle Grid job job_123. Summarise the current status, execution phase, phase timing, delayed-start reason, scheduling details, and artifact readiness if available.
```

## Inspect Lifecycle Events

```text
Fetch lifecycle events for Jungle Grid job job_123. Explain what happened before workload logs began, including queueing, route selection, scheduling, provisioning, startup, retry, failure, or cancellation events.
```

## Retrieve Workload Logs

```text
Fetch persisted workload logs for Jungle Grid job job_123. If no workload logs are available yet, also fetch lifecycle events and explain whether the job is still queued, scheduling, provisioning, or preparing runtime.
```

## Failure Analysis

```text
Inspect Jungle Grid job job_123. Get the latest status, lifecycle events, persisted logs, and artifact list. Explain the most likely failure stage and whether there are retry, cancellation, or artifact clues.
```

## Inspect Managed Artifacts

```text
List managed artifacts for Jungle Grid job job_123. If files are available, get a signed download URL for the most relevant artifact.
```

## Submit a Docker-Image Command Payload

```text
Submit a batch job with image python:3.11-slim and command ["python","-c","import os; print('hello from jungle grid')"]. Use the most cost-effective routing that is currently available.
```

## Submit a File-Backed Job

```text
Create upload slots for transcribe.py as a script and audio.ogg as an input. After I upload and complete both files, submit an inference job that runs python /workspace/scripts/transcribe.py /workspace/inputs/audio.ogg /workspace/artifacts/transcript.txt, then monitor events, status, logs, and retrieve the transcript artifact.
```
