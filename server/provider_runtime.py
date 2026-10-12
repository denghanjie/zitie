"""Bounded upstream calls: deadlines never release still-running capacity."""
import threading
import time

class ProviderBusy(Exception): pass
class ProviderTimeout(Exception): pass
class ProviderCoolingDown(Exception): pass

class ProviderGate:
    def __init__(self, capacity=2, timeout=8, cooldown=30):
        self.slots = threading.BoundedSemaphore(capacity)
        self.timeout, self.cooldown = timeout, cooldown
        self.lock = threading.Lock()
        self.until = 0

    def cooling_down(self):
        with self.lock:
            return time.monotonic() < self.until

    def fail(self):
        with self.lock:
            self.until = max(self.until, time.monotonic() + self.cooldown)

    def run(self, action):
        if self.cooling_down():
            raise ProviderCoolingDown()
        if not self.slots.acquire(blocking=False):
            raise ProviderBusy()
        done, outcome = threading.Event(), {}
        def work():
            try:
                outcome['value'] = action()
            except Exception as error:
                outcome['error'] = error
                self.fail()
            finally:
                self.slots.release()
                done.set()
        try:
            threading.Thread(target=work, daemon=True).start()
        except Exception:
            self.slots.release()
            raise
        if not done.wait(self.timeout):
            self.fail()
            raise ProviderTimeout()
        if 'error' in outcome:
            raise outcome['error']
        return outcome['value']
