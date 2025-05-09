#!/usr/bin/env python3
import inkex
from lxml import etree

class InsertCueIDStub(inkex.Effect):
    def add_arguments(self, pars):
        pars.add_argument("--id_stub", type=str, help="Cue ID Stub")

    def effect(self):
        stub = self.options.id_stub

        if self.svg.selected:
            for elem in self.svg.selection:
                elem.set("id", stub)
        else:
            new = etree.SubElement(self.svg.get_current_layer(), inkex.addNS('rect', 'svg'))
            new.set("x", "100")
            new.set("y", "100")
            new.set("width", "150")
            new.set("height", "50")
            new.set("style", "fill:#cccccc;stroke:#000000;stroke-width:1")
            new.set("id", stub)

if __name__ == '__main__':
    InsertCueIDStub().run()
