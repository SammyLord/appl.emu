document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    let keyboardBuffer = [];

    const ram = new Uint8Array(65536); // 64KB of RAM

    const wozmonROM = [
        0xD8, 0x58, 0xA0, 0x7F, 0x8C, 0x12, 0xD0, 0xA9, 0xA7, 0x8D, 0x11, 0xD0, 0x8D, 0x13, 0xD0, 0xC9,
        0xDF, 0xF0, 0x13, 0xC9, 0x9B, 0xF0, 0x03, 0xC8, 0x10, 0x0F, 0xA9, 0xDC, 0x20, 0xEF, 0xFF, 0xA9,
        0x8D, 0x20, 0xEF, 0xFF, 0xA0, 0x01, 0x88, 0x30, 0xF6, 0xAD, 0x11, 0xD0, 0x10, 0xFB, 0xAD, 0x10,
        0xD0, 0x99, 0x00, 0x02, 0x20, 0xEF, 0xFF, 0xC9, 0x8D, 0xD0, 0xD4, 0xA0, 0xFF, 0xA9, 0x00, 0xAA,
        0x0A, 0x85, 0x2B, 0xC8, 0xB9, 0x00, 0x02, 0xC9, 0x8D, 0xF0, 0xD4, 0xC9, 0xAE, 0x90, 0xF4, 0xF0,
        0xF0, 0xC9, 0xBA, 0xF0, 0xEB, 0xC9, 0xD2, 0xF0, 0x3B, 0x86, 0x28, 0x86, 0x29, 0x84, 0x2A, 0xB9,
        0x00, 0x02, 0x49, 0xB0, 0xC9, 0x0A, 0x90, 0x06, 0x69, 0x88, 0xC9, 0xFA, 0x90, 0x11, 0x0A, 0x0A,
        0x0A, 0x0A, 0xA2, 0x04, 0x0A, 0x26, 0x28, 0x26, 0x29, 0xCA, 0xD0, 0xF8, 0xC8, 0xD0, 0xE0, 0xC4,
        0x2A, 0xF0, 0x97, 0x24, 0x2B, 0x50, 0x10, 0xA5, 0x28, 0x81, 0x26, 0xE6, 0x26, 0xD0, 0xB5, 0xE6,
        0x27, 0x4C, 0x44, 0xFF, 0x6C, 0x24, 0x00, 0x30, 0x2B, 0xA2, 0x02, 0xB5, 0x27, 0x95, 0x25, 0x95,
        0x23, 0xCA, 0xD0, 0xF7, 0xD0, 0x14, 0xA9, 0x8D, 0x20, 0xEF, 0xFF, 0xA5, 0x25, 0x20, 0xDC, 0xFF,
        0xA5, 0x24, 0x20, 0xDC, 0xFF, 0xA9, 0xBA, 0x20, 0xEF, 0xFF, 0xA9, 0xA0, 0x20, 0xEF, 0xFF, 0xA1,
        0x24, 0x20, 0xDC, 0xFF, 0x86, 0x2B, 0xA5, 0x24, 0xC5, 0x28, 0xA5, 0x25, 0xE5, 0x29, 0xB0, 0xC1,
        0xE6, 0x24, 0xD0, 0x02, 0xE6, 0x25, 0xA5, 0x24, 0x29, 0x07, 0x10, 0xC8, 0x48, 0x4A, 0x4A, 0x4A,
        0x4A, 0x20, 0xE5, 0xFF, 0x68, 0x29, 0x0F, 0x09, 0xB0, 0xC9, 0xBA, 0x90, 0x02, 0x69, 0x06, 0x2C,
        0x12, 0xD0, 0x30, 0xFB, 0x8D, 0x12, 0xD0, 0x60, 0x00, 0x00, 0x00, 0x0F, 0x00, 0xFF, 0x00, 0x00
    ];

    function loadRom() {
        wozmonROM.forEach((byte, index) => {
            ram[0xFF00 + index] = byte;
        });
    }

    const cpu = {
        pc: 0, // Program Counter
        a: 0,  // Accumulator
        x: 0,  // X Register
        y: 0,  // Y Register
        sp: 0, // Stack Pointer
        
        // Status Flags: N V - B D I Z C
        status: 0x20,

        reset: () => {
            cpu.pc = cpu.read16(0xFFFC);
            cpu.sp = 0xFF;
            cpu.status = 0x20;
        },

        step: () => {
            const opcode = cpu.read(cpu.pc++);
            const instruction = cpu.instructions[opcode];
            if (instruction) {
                instruction.execute();
            } else {
                // console.log(`Unknown opcode: ${opcode.toString(16)} at ${ (cpu.pc - 1).toString(16)}`);
            }
        },

        // Addressing mode functions
        addr: {
            imm: () => cpu.pc++,
            zp: () => cpu.read(cpu.pc++),
            zpx: () => (cpu.read(cpu.pc++) + cpu.x) & 0xFF,
            zpy: () => (cpu.read(cpu.pc++) + cpu.y) & 0xFF,
            abs: () => { const addr = cpu.read16(cpu.pc); cpu.pc += 2; return addr; },
            absx: () => { const addr = cpu.read16(cpu.pc) + cpu.x; cpu.pc += 2; return addr; },
            absy: () => { const addr = cpu.read16(cpu.pc) + cpu.y; cpu.pc += 2; return addr; },
            ind: () => { // for JMP only
                const ptr = cpu.read16(cpu.pc);
                // 6502 indirect jump bug emulation
                if ((ptr & 0x00FF) === 0x00FF) {
                    return (cpu.read(ptr & 0xFF00) << 8) | cpu.read(ptr);
                }
                return cpu.read16(ptr);
            },
            indx: () => {
                const ptr = (cpu.read(cpu.pc++) + cpu.x) & 0xFF;
                return cpu.read16_zp(ptr);
            },
            indy: () => {
                const ptr = cpu.read(cpu.pc++);
                const base = cpu.read16_zp(ptr);
                return base + cpu.y;
            }
        },

        // Status flag helpers
        setZ: (val) => {
            if ((val & 0xFF) === 0) cpu.status |= 0x02; else cpu.status &= ~0x02;
        },
        getZ: () => (cpu.status & 0x02) > 0,
        setN: (val) => {
            if (val & 0x80) cpu.status |= 0x80; else cpu.status &= ~0x80;
        },
        getN: () => (cpu.status & 0x80) > 0,
        setC: (val) => {
            if (val) cpu.status |= 0x01; else cpu.status &= ~0x01;
        },
        getC: () => (cpu.status & 0x01) > 0,
        setI: (val) => {
            if (val) cpu.status |= 0x04; else cpu.status &= ~0x04;
        },
        setV: (val) => {
            if (val) cpu.status |= 0x40; else cpu.status &= ~0x40;
        },
        getV: () => (cpu.status & 0x40) > 0,

        // Memory access helpers
        read: (addr) => read(addr),
        write: (addr, val) => write(addr, val),
        read16: (addr) => (cpu.read(addr + 1) << 8) | cpu.read(addr),
        read16_zp: (addr) => (cpu.read((addr + 1) & 0xFF) << 8) | cpu.read(addr),
        
        push: (val) => { cpu.write(0x100 + cpu.sp--, val); },
        pop: () => cpu.read(0x100 + ++cpu.sp),
        push16: (val) => { cpu.push(val >> 8); cpu.push(val & 0xFF); },
        pop16: () => cpu.pop() | (cpu.pop() << 8),

        // Branch helper
        branch: (condition) => {
            const offset = cpu.read(cpu.pc++);
            if (condition) {
                // The offset is a signed byte
                cpu.pc += (offset < 128) ? offset : offset - 256;
            }
        },

        // Instruction implementation
        op: {
            LDA: (addr) => { cpu.a = cpu.read(addr); cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            LDX: (addr) => { cpu.x = cpu.read(addr); cpu.setZ(cpu.x); cpu.setN(cpu.x); },
            LDY: (addr) => { cpu.y = cpu.read(addr); cpu.setZ(cpu.y); cpu.setN(cpu.y); },
            STA: (addr) => { cpu.write(addr, cpu.a); },
            STX: (addr) => { cpu.write(addr, cpu.x); },
            STY: (addr) => { cpu.write(addr, cpu.y); },
            JMP: (addr) => { cpu.pc = addr; },
            JSR: (addr) => { cpu.push16(cpu.pc - 1); cpu.pc = addr; },
            RTS: () => { cpu.pc = cpu.pop16() + 1; },
            BPL: () => cpu.branch(!cpu.getN()),
            BMI: () => cpu.branch(cpu.getN()),
            BEQ: () => cpu.branch(cpu.getZ()),
            BNE: () => cpu.branch(!cpu.getZ()),
            BCS: () => cpu.branch(cpu.getC()),
            BCC: () => cpu.branch(!cpu.getC()),
            BVS: () => cpu.branch(cpu.getV()),
            BVC: () => cpu.branch(!cpu.getV()),
            CMP: (addr) => { const val = cpu.read(addr); const res = cpu.a - val; cpu.setC(res >= 0); cpu.setZ(res & 0xFF); cpu.setN(res); },
            CPX: (addr) => { const val = cpu.read(addr); const res = cpu.x - val; cpu.setC(res >= 0); cpu.setZ(res & 0xFF); cpu.setN(res); },
            CPY: (addr) => { const val = cpu.read(addr); const res = cpu.y - val; cpu.setC(res >= 0); cpu.setZ(res & 0xFF); cpu.setN(res); },
            INC: (addr) => { const val = (cpu.read(addr) + 1) & 0xFF; cpu.write(addr, val); cpu.setZ(val); cpu.setN(val); },
            DEC: (addr) => { const val = (cpu.read(addr) - 1) & 0xFF; cpu.write(addr, val); cpu.setZ(val); cpu.setN(val); },
            INX: () => { cpu.x = (cpu.x + 1) & 0xFF; cpu.setZ(cpu.x); cpu.setN(cpu.x); },
            INY: () => { cpu.y = (cpu.y + 1) & 0xFF; cpu.setZ(cpu.y); cpu.setN(cpu.y); },
            DEX: () => { cpu.x = (cpu.x - 1) & 0xFF; cpu.setZ(cpu.x); cpu.setN(cpu.x); },
            DEY: () => { cpu.y = (cpu.y - 1) & 0xFF; cpu.setZ(cpu.y); cpu.setN(cpu.y); },
            AND: (addr) => { cpu.a &= cpu.read(addr); cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            ORA: (addr) => { cpu.a |= cpu.read(addr); cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            EOR: (addr) => { cpu.a ^= cpu.read(addr); cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            ADC: (addr) => {
                const val = cpu.read(addr);
                const res = cpu.a + val + cpu.getC();
                cpu.setV((!((cpu.a ^ val) & 0x80)) && (((cpu.a ^ res) & 0x80)));
                cpu.setC(res > 0xFF);
                cpu.a = res & 0xFF;
                cpu.setZ(cpu.a); cpu.setN(cpu.a);
            },
            SBC: (addr) => {
                const val = cpu.read(addr) ^ 0xFF;
                const res = cpu.a + val + cpu.getC();
                cpu.setV((((cpu.a ^ res) & 0x80) != 0) && (((cpu.a ^ val) & 0x80) != 0));
                cpu.setC(res > 0xFF);
                cpu.a = res & 0xFF;
                cpu.setZ(cpu.a); cpu.setN(cpu.a);
            },
            ASL_A: () => { cpu.setC(cpu.a & 0x80); cpu.a = (cpu.a << 1) & 0xFF; cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            ASL: (addr) => { let val = cpu.read(addr); cpu.setC(val & 0x80); val = (val << 1) & 0xFF; cpu.write(addr, val); cpu.setZ(val); cpu.setN(val); },
            LSR_A: () => { cpu.setC(cpu.a & 0x01); cpu.a = (cpu.a >> 1); cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            LSR: (addr) => { let val = cpu.read(addr); cpu.setC(val & 0x01); val = (val >> 1); cpu.write(addr, val); cpu.setZ(val); cpu.setN(val); },
            ROL_A: () => { const c = cpu.getC(); cpu.setC(cpu.a & 0x80); cpu.a = ((cpu.a << 1) | c) & 0xFF; cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            ROL: (addr) => { const c = cpu.getC(); let val = cpu.read(addr); cpu.setC(val & 0x80); val = ((val << 1) | c) & 0xFF; cpu.write(addr, val); cpu.setZ(val); cpu.setN(val); },
            ROR_A: () => { const c = cpu.getC(); cpu.setC(cpu.a & 0x01); cpu.a = (cpu.a >> 1) | (c ? 0x80 : 0); cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            ROR: (addr) => { const c = cpu.getC(); let val = cpu.read(addr); cpu.setC(val & 0x01); val = (val >> 1) | (c ? 0x80 : 0); cpu.write(addr, val); cpu.setZ(val); cpu.setN(val); },
            BIT: (addr) => { const val = cpu.read(addr); cpu.setZ(cpu.a & val); cpu.setV(val & 0x40); cpu.setN(val & 0x80); },
            CLC: () => cpu.setC(false), SEC: () => cpu.setC(true),
            CLD: () => {}, SED: () => {}, // Not implemented, Wozmon uses it
            CLI: () => cpu.setI(false), SEI: () => cpu.setI(true),
            CLV: () => cpu.setV(false),
            PHA: () => cpu.push(cpu.a), PLA: () => { cpu.a = cpu.pop(); cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            PHP: () => cpu.push(cpu.status | 0x10), PLP: () => { cpu.status = cpu.pop() | 0x20; },
            TAX: () => { cpu.x = cpu.a; cpu.setZ(cpu.x); cpu.setN(cpu.x); },
            TXA: () => { cpu.a = cpu.x; cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            TAY: () => { cpu.y = cpu.a; cpu.setZ(cpu.y); cpu.setN(cpu.y); },
            TYA: () => { cpu.a = cpu.y; cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            TSX: () => { cpu.x = cpu.sp; cpu.setZ(cpu.x); cpu.setN(cpu.x); },
            TXS: () => { cpu.sp = cpu.x; },
        }
    };

    cpu.instructions = {
        0x00: { execute: () => { /* BRK */ } }, 
        0x01: { execute: () => cpu.op.ORA(cpu.addr.indx()) }, 0x05: { execute: () => cpu.op.ORA(cpu.addr.zp()) }, 0x06: { execute: () => cpu.op.ASL(cpu.addr.zp()) }, 0x08: { execute: () => cpu.op.PHP() }, 0x09: { execute: () => cpu.op.ORA(cpu.addr.imm()) }, 0x0A: { execute: () => cpu.op.ASL_A() }, 0x0D: { execute: () => cpu.op.ORA(cpu.addr.abs()) }, 0x0E: { execute: () => cpu.op.ASL(cpu.addr.abs()) },
        0x10: { execute: () => cpu.op.BPL() }, 0x11: { execute: () => cpu.op.ORA(cpu.addr.indy()) }, 0x15: { execute: () => cpu.op.ORA(cpu.addr.zpx()) }, 0x16: { execute: () => cpu.op.ASL(cpu.addr.zpx()) }, 0x18: { execute: () => cpu.op.CLC() }, 0x19: { execute: () => cpu.op.ORA(cpu.addr.absy()) }, 0x1D: { execute: () => cpu.op.ORA(cpu.addr.absx()) }, 0x1E: { execute: () => cpu.op.ASL(cpu.addr.absx()) },
        0x20: { execute: () => { const addr = cpu.addr.abs(); cpu.op.JSR(addr); } }, 0x21: { execute: () => cpu.op.AND(cpu.addr.indx()) }, 0x24: { execute: () => cpu.op.BIT(cpu.addr.zp()) }, 0x25: { execute: () => cpu.op.AND(cpu.addr.zp()) }, 0x26: { execute: () => cpu.op.ROL(cpu.addr.zp()) }, 0x28: { execute: () => cpu.op.PLP() }, 0x29: { execute: () => cpu.op.AND(cpu.addr.imm()) }, 0x2A: { execute: () => cpu.op.ROL_A() }, 0x2C: { execute: () => cpu.op.BIT(cpu.addr.abs()) }, 0x2D: { execute: () => cpu.op.AND(cpu.addr.abs()) }, 0x2E: { execute: () => cpu.op.ROL(cpu.addr.abs()) },
        0x30: { execute: () => cpu.op.BMI() }, 0x31: { execute: () => cpu.op.AND(cpu.addr.indy()) }, 0x35: { execute: () => cpu.op.AND(cpu.addr.zpx()) }, 0x36: { execute: () => cpu.op.ROL(cpu.addr.zpx()) }, 0x38: { execute: () => cpu.op.SEC() }, 0x39: { execute: () => cpu.op.AND(cpu.addr.absy()) }, 0x3D: { execute: () => cpu.op.AND(cpu.addr.absx()) }, 0x3E: { execute: () => cpu.op.ROL(cpu.addr.absx()) },
        0x40: { execute: () => { /* RTI */ } }, 0x41: { execute: () => cpu.op.EOR(cpu.addr.indx()) }, 0x45: { execute: () => cpu.op.EOR(cpu.addr.zp()) }, 0x46: { execute: () => cpu.op.LSR(cpu.addr.zp()) }, 0x48: { execute: () => cpu.op.PHA() }, 0x49: { execute: () => cpu.op.EOR(cpu.addr.imm()) }, 0x4A: { execute: () => cpu.op.LSR_A() }, 0x4C: { execute: () => cpu.op.JMP(cpu.addr.abs()) }, 0x4D: { execute: () => cpu.op.EOR(cpu.addr.abs()) }, 0x4E: { execute: () => cpu.op.LSR(cpu.addr.abs()) },
        0x50: { execute: () => cpu.op.BVC() }, 0x51: { execute: () => cpu.op.EOR(cpu.addr.indy()) }, 0x55: { execute: () => cpu.op.EOR(cpu.addr.zpx()) }, 0x56: { execute: () => cpu.op.LSR(cpu.addr.zpx()) }, 0x58: { execute: () => cpu.op.CLI() }, 0x59: { execute: () => cpu.op.EOR(cpu.addr.absy()) }, 0x5D: { execute: () => cpu.op.EOR(cpu.addr.absx()) }, 0x5E: { execute: () => cpu.op.LSR(cpu.addr.absx()) },
        0x60: { execute: () => cpu.op.RTS() }, 0x61: { execute: () => cpu.op.ADC(cpu.addr.indx()) }, 0x65: { execute: () => cpu.op.ADC(cpu.addr.zp()) }, 0x66: { execute: () => cpu.op.ROR(cpu.addr.zp()) }, 0x68: { execute: () => cpu.op.PLA() }, 0x69: { execute: () => cpu.op.ADC(cpu.addr.imm()) }, 0x6A: { execute: () => cpu.op.ROR_A() }, 0x6C: { execute: () => cpu.op.JMP(cpu.addr.ind()) }, 0x6D: { execute: () => cpu.op.ADC(cpu.addr.abs()) }, 0x6E: { execute: () => cpu.op.ROR(cpu.addr.abs()) },
        0x70: { execute: () => cpu.op.BVS() }, 0x71: { execute: () => cpu.op.ADC(cpu.addr.indy()) }, 0x75: { execute: () => cpu.op.ADC(cpu.addr.zpx()) }, 0x76: { execute: () => cpu.op.ROR(cpu.addr.zpx()) }, 0x78: { execute: () => cpu.op.SEI() }, 0x79: { execute: () => cpu.op.ADC(cpu.addr.absy()) }, 0x7D: { execute: () => cpu.op.ADC(cpu.addr.absx()) }, 0x7E: { execute: () => cpu.op.ROR(cpu.addr.absx()) },
        0x81: { execute: () => cpu.op.STA(cpu.addr.indx()) }, 0x84: { execute: () => cpu.op.STY(cpu.addr.zp()) }, 0x85: { execute: () => cpu.op.STA(cpu.addr.zp()) }, 0x86: { execute: () => cpu.op.STX(cpu.addr.zp()) }, 0x88: { execute: () => cpu.op.DEY() }, 0x8A: { execute: () => cpu.op.TXA() }, 0x8C: { execute: () => cpu.op.STY(cpu.addr.abs()) }, 0x8D: { execute: () => cpu.op.STA(cpu.addr.abs()) }, 0x8E: { execute: () => cpu.op.STX(cpu.addr.abs()) },
        0x90: { execute: () => cpu.op.BCC() }, 0x91: { execute: () => cpu.op.STA(cpu.addr.indy()) }, 0x94: { execute: () => cpu.op.STY(cpu.addr.zpx()) }, 0x95: { execute: () => cpu.op.STA(cpu.addr.zpx()) }, 0x96: { execute: () => cpu.op.STX(cpu.addr.zpy()) }, 0x98: { execute: () => cpu.op.TYA() }, 0x99: { execute: () => cpu.op.STA(cpu.addr.absy()) }, 0x9A: { execute: () => cpu.op.TXS() }, 0x9D: { execute: () => cpu.op.STA(cpu.addr.absx()) },
        0xA0: { execute: () => cpu.op.LDY(cpu.addr.imm()) }, 0xA1: { execute: () => cpu.op.LDA(cpu.addr.indx()) }, 0xA2: { execute: () => cpu.op.LDX(cpu.addr.imm()) }, 0xA4: { execute: () => cpu.op.LDY(cpu.addr.zp()) }, 0xA5: { execute: () => cpu.op.LDA(cpu.addr.zp()) }, 0xA6: { execute: () => cpu.op.LDX(cpu.addr.zp()) }, 0xA8: { execute: () => cpu.op.TAY() }, 0xA9: { execute: () => cpu.op.LDA(cpu.addr.imm()) }, 0xAA: { execute: () => cpu.op.TAX() }, 0xAC: { execute: () => cpu.op.LDY(cpu.addr.abs()) }, 0xAD: { execute: () => cpu.op.LDA(cpu.addr.abs()) }, 0xAE: { execute: () => cpu.op.LDX(cpu.addr.abs()) },
        0xB0: { execute: () => cpu.op.BCS() }, 0xB1: { execute: () => cpu.op.LDA(cpu.addr.indy()) }, 0xB4: { execute: () => cpu.op.LDY(cpu.addr.zpx()) }, 0xB5: { execute: () => cpu.op.LDA(cpu.addr.zpx()) }, 0xB6: { execute: () => cpu.op.LDX(cpu.addr.zpy()) }, 0xB8: { execute: () => cpu.op.CLV() }, 0xB9: { execute: () => cpu.op.LDA(cpu.addr.absy()) }, 0xBA: { execute: () => cpu.op.TSX() }, 0xBC: { execute: () => cpu.op.LDY(cpu.addr.absx()) }, 0xBD: { execute: () => cpu.op.LDA(cpu.addr.absx()) }, 0xBE: { execute: () => cpu.op.LDX(cpu.addr.absy()) },
        0xC0: { execute: () => cpu.op.CPY(cpu.addr.imm()) }, 0xC1: { execute: () => cpu.op.CMP(cpu.addr.indx()) }, 0xC4: { execute: () => cpu.op.CPY(cpu.addr.zp()) }, 0xC5: { execute: () => cpu.op.CMP(cpu.addr.zp()) }, 0xC6: { execute: () => cpu.op.DEC(cpu.addr.zp()) }, 0xC8: { execute: () => cpu.op.INY() }, 0xC9: { execute: () => cpu.op.CMP(cpu.addr.imm()) }, 0xCA: { execute: () => cpu.op.DEX() }, 0xCC: { execute: () => cpu.op.CPY(cpu.addr.abs()) }, 0xCD: { execute: () => cpu.op.CMP(cpu.addr.abs()) }, 0xCE: { execute: () => cpu.op.DEC(cpu.addr.abs()) },
        0xD0: { execute: () => cpu.op.BNE() }, 0xD1: { execute: () => cpu.op.CMP(cpu.addr.indy()) }, 0xD5: { execute: () => cpu.op.CMP(cpu.addr.zpx()) }, 0xD6: { execute: () => cpu.op.DEC(cpu.addr.zpx()) }, 0xD8: { execute: () => cpu.op.CLD() }, 0xD9: { execute: () => cpu.op.CMP(cpu.addr.absy()) }, 0xDD: { execute: () => cpu.op.CMP(cpu.addr.absx()) }, 0xDE: { execute: () => cpu.op.DEC(cpu.addr.absx()) },
        0xE0: { execute: () => cpu.op.CPX(cpu.addr.imm()) }, 0xE1: { execute: () => cpu.op.SBC(cpu.addr.indx()) }, 0xE4: { execute: () => cpu.op.CPX(cpu.addr.zp()) }, 0xE5: { execute: () => cpu.op.SBC(cpu.addr.zp()) }, 0xE6: { execute: () => cpu.op.INC(cpu.addr.zp()) }, 0xE8: { execute: () => cpu.op.INX() }, 0xE9: { execute: () => cpu.op.SBC(cpu.addr.imm()) }, 0xEA: { execute: () => { /* NOP */ } }, 0xEC: { execute: () => cpu.op.CPX(cpu.addr.abs()) }, 0xED: { execute: () => cpu.op.SBC(cpu.addr.abs()) }, 0xEE: { execute: () => cpu.op.INC(cpu.addr.abs()) },
        0xF0: { execute: () => cpu.op.BEQ() }, 0xF1: { execute: () => cpu.op.SBC(cpu.addr.indy()) }, 0xF5: { execute: () => cpu.op.SBC(cpu.addr.zpx()) }, 0xF6: { execute: () => cpu.op.INC(cpu.addr.zpx()) }, 0xF8: { execute: () => cpu.op.SED() }, 0xF9: { execute: () => cpu.op.SBC(cpu.addr.absy()) }, 0xFD: { execute: () => cpu.op.SBC(cpu.addr.absx()) }, 0xFE: { execute: () => cpu.op.INC(cpu.addr.absx()) },
    };

    let cra = 0, crb = 0;
    let ddrb_written = false;

    function read(addr) {
        if (addr >= 0xD010 && addr <= 0xD013) {
            // Simplified PIA read logic for Wozmon
            if (addr === 0xD011) { // KBDCR
                if (keyboardBuffer.length > 0) {
                    return 0x80; // Key available
                }
                return 0;
            }
            if (addr === 0xD010) { // KBD
                if (keyboardBuffer.length > 0) {
                    return keyboardBuffer.shift();
                }
                return 0;
            }
        }
        return ram[addr];
    }
    
    function write(addr, val) {
        if (addr === 0xD012) { // Display
             if (!ddrb_written) {
                // First write is to DDRB
                ddrb_written = true;
            } else {
                const charCode = val & 0x7F;
                if (charCode === 0x0D) { // Carriage Return
                    output.textContent += '\n';
                } else {
                    output.textContent += String.fromCharCode(charCode);
                }
            }
            return;
        }
        ram[addr] = val;
    }


    function run() {
        loadRom();
        cpu.reset();
        
        // A simple execution loop
        // In a real emulator, this would be more complex to manage timing.
        setInterval(() => {
            // Wozmon is fast, so let's run a bunch of instructions
            // to make it feel responsive.
            for (let i = 0; i < 10000; i++) {
                cpu.step();
            }
        }, 16);

        document.addEventListener('keydown', handleKey);
    }

    function handleKey(e) {
        e.preventDefault();
        const char = e.key;
        let appleCharCode;

        if (char === 'Backspace') {
            // Modern convenience: visually remove the character
            const lastChar = output.textContent.slice(-1);
            if (lastChar !== '\n' && lastChar !== '\r') {
                output.textContent = output.textContent.slice(0, -1);
            }
            appleCharCode = 0xDF; // Apple's back arrow keycode
        } else if (char.length === 1) {
            appleCharCode = char.toUpperCase().charCodeAt(0);
        } else if (char === 'Enter') {
            appleCharCode = 0x8D; // Apple's CR
        }

        if (appleCharCode) {
            keyboardBuffer.push(appleCharCode | 0x80); // Set high bit
        }
    }
    
    run();
}); 