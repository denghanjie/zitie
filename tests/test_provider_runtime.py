import sys, threading, time, unittest
from pathlib import Path
sys.path.insert(0,str(Path('server').resolve()))
from provider_runtime import ProviderGate, ProviderBusy, ProviderTimeout, ProviderCoolingDown

class GateTests(unittest.TestCase):
 def test_timeout_keeps_real_capacity_until_worker_exits(self):
  gate=ProviderGate(capacity=1,timeout=.03,cooldown=0)
  stop=threading.Event()
  try:
   before=time.monotonic()
   with self.assertRaises(ProviderTimeout):gate.run(lambda:stop.wait(1))
   self.assertLess(time.monotonic()-before,.2)
   with self.assertRaises(ProviderBusy):gate.run(lambda:None)
  finally:stop.set()
  time.sleep(.02)
  self.assertEqual(gate.run(lambda:4),4)
 def test_errors_cool_down_without_retries(self):
  gate=ProviderGate(timeout=.1,cooldown=1);calls=[]
  def bad():calls.append(1);raise ValueError('private')
  with self.assertRaises(ValueError):gate.run(bad)
  with self.assertRaises(ProviderCoolingDown):gate.run(bad)
  self.assertEqual(calls,[1])
 def test_active_capacity_is_bounded(self):
  gate=ProviderGate(capacity=1,timeout=.3,cooldown=0);started=threading.Event();stop=threading.Event()
  thread=threading.Thread(target=lambda:gate.run(lambda:(started.set(),stop.wait(.2))))
  thread.start();started.wait(.2)
  with self.assertRaises(ProviderBusy):gate.run(lambda:None)
  stop.set();thread.join()
