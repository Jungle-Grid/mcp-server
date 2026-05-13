# Example Prompts for MCP Hosts

These prompts are written for Claude Desktop, Cursor, Windsurf, and other
MCP-compatible agents that have the `junglegrid` server enabled.

## Estimate a Job Before Submission

```text
Estimate the cost of running a batch job with image nvidia/cuda:12.2.0-base-ubuntu22.04 and command ["bash","-lc","python train.py --epochs 3"]. Optimise for cost and prefer us-east if possible.
```

## Submit a Managed Batch Job

```text
Submit a batch job named "mnist-train" using image pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime with command ["python","train.py","--epochs","5"]. After submission, tell me the job id and next tool to call.
```

## Check Job Status

```text
Check the status of Jungle Grid job job_123. Summarise whether it is still queued, running, or finished and include any scheduling reason if available.
```

## Stream Live Logs

```text
Stream live logs for Jungle Grid job job_123 for up to 180 seconds. Show stdout, stderr, and tell me whether the process exited cleanly.
```

## Retrieve Final Logs

```text
Fetch the final runtime logs for Jungle Grid job job_123. If stdout or stderr is unavailable, explain why from the runtime metadata.
```

## Failure Analysis

```text
Inspect Jungle Grid job job_123. Get the latest status, fetch runtime logs, and explain the most likely reason the workload failed.
```

## Inspect Managed Artifacts

```text
List managed artifacts for Jungle Grid job job_123. If files are available, get a signed download URL for the most relevant artifact.
```

## Submit a Docker-Image Command Payload

```text
Submit a batch job with image python:3.11-slim and command ["python","-c","import os; print('hello from jungle grid')"]. Use the most cost-effective routing that is currently available.
```
