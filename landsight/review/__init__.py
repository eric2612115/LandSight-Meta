"""The package review: a developer's folder in, a docs/API.md `Run` out (triage, sheets, take-off, checks, scoreboard).

`review` and `locate` load the pipeline on first use, so light modules (landsight.review.scenarios) import cheaply."""

__all__ = ["locate", "review"]


def __getattr__(name):
    if name in __all__:
        from landsight.review import run

        return getattr(run, name)
    raise AttributeError(name)
