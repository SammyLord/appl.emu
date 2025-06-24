document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const keyboardInput = document.getElementById('keyboard-input');
    const screen = document.getElementById('screen');
    const pasteButton = document.getElementById('paste-button');
    const progressContainer = document.getElementById('progress-container');
    const progressStatus = document.getElementById('progress-status');
    const progressBar = document.getElementById('progress-bar-inner');
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
        
        // Set up proper interrupt vectors
        // IRQ/BRK vector ($FFFE) should point to Wozmon entry
        ram[0xFFFE] = 0x00;  // Low byte of $FF00 (Wozmon entry)
        ram[0xFFFF] = 0xFF;  // High byte of $FF00
        
        // Reset vector ($FFFC) should also point to Wozmon
        ram[0xFFFC] = 0x00;  // Low byte of $FF00
        ram[0xFFFD] = 0xFF;  // High byte of $FF00
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
                console.log(`Unknown opcode: ${opcode.toString(16).padStart(2, '0')} at $${(cpu.pc - 1).toString(16).toUpperCase().padStart(4, '0')}`);
            }
        },

        // Debug helper
        getState: () => ({
            pc: cpu.pc,
            a: cpu.a,
            x: cpu.x,
            y: cpu.y,
            sp: cpu.sp,
            status: cpu.status
        }),

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
            PHP: () => cpu.push(cpu.status & ~0x10), PLP: () => { cpu.status = (cpu.pop() & ~0x10) | 0x20; },
            TAX: () => { cpu.x = cpu.a; cpu.setZ(cpu.x); cpu.setN(cpu.x); },
            TXA: () => { cpu.a = cpu.x; cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            TAY: () => { cpu.y = cpu.a; cpu.setZ(cpu.y); cpu.setN(cpu.y); },
            TYA: () => { cpu.a = cpu.y; cpu.setZ(cpu.a); cpu.setN(cpu.a); },
            TSX: () => { cpu.x = cpu.sp; cpu.setZ(cpu.x); cpu.setN(cpu.x); },
            TXS: () => { cpu.sp = cpu.x; },
        }
    };

    // Generate complete 6502 instruction set (all 256 opcodes)
    cpu.instructions = {};
    
    // Fill all 256 opcodes first with NOPs to prevent crashes
    for (let i = 0; i < 256; i++) {
        cpu.instructions[i] = { execute: () => { /* Unimplemented/illegal opcode - NOP */ } };
    }
    
    // Add some common illegal opcodes that were sometimes used
    cpu.instructions[0x82] = { execute: () => { /* Illegal NOP #imm - skip next byte */ cpu.pc++; } };
    cpu.instructions[0x89] = { execute: () => { /* Illegal NOP #imm - skip next byte */ cpu.pc++; } };
    cpu.instructions[0xC2] = { execute: () => { /* Illegal NOP #imm - skip next byte */ cpu.pc++; } };
    cpu.instructions[0xE2] = { execute: () => { /* Illegal NOP #imm - skip next byte */ cpu.pc++; } };
    cpu.instructions[0xB2] = { execute: () => { /* Illegal opcode - treat as NOP */ } };
    
    // Now implement all official 6502 opcodes
    Object.assign(cpu.instructions, {
        // Row 0x0_
        0x00: { execute: () => {
            /* BRK */
            // A BRK instruction pushes PC+2 and status, then loads the IRQ vector into PC.
            // It's a 1-byte instruction, but the PC effectively advances by 2.
            // When this is called, PC is already at Addr+1 due to the fetch cycle.
            cpu.push16(cpu.pc + 1);
            cpu.push(cpu.status | 0x10); // Set B flag in status pushed to stack
            cpu.setI(true);
            cpu.pc = cpu.read16(0xFFFE);
        } },
        0x01: { execute: () => cpu.op.ORA(cpu.addr.indx()) },
        0x05: { execute: () => cpu.op.ORA(cpu.addr.zp()) },
        0x06: { execute: () => cpu.op.ASL(cpu.addr.zp()) },
        0x08: { execute: () => cpu.op.PHP() },
        0x09: { execute: () => cpu.op.ORA(cpu.addr.imm()) },
        0x0A: { execute: () => cpu.op.ASL_A() },
        0x0D: { execute: () => cpu.op.ORA(cpu.addr.abs()) },
        0x0E: { execute: () => cpu.op.ASL(cpu.addr.abs()) },

        // Row 0x1_
        0x10: { execute: () => cpu.op.BPL() },
        0x11: { execute: () => cpu.op.ORA(cpu.addr.indy()) },
        0x15: { execute: () => cpu.op.ORA(cpu.addr.zpx()) },
        0x16: { execute: () => cpu.op.ASL(cpu.addr.zpx()) },
        0x18: { execute: () => cpu.op.CLC() },
        0x19: { execute: () => cpu.op.ORA(cpu.addr.absy()) },
        0x1D: { execute: () => cpu.op.ORA(cpu.addr.absx()) },
        0x1E: { execute: () => cpu.op.ASL(cpu.addr.absx()) },

        // Row 0x2_
        0x20: { execute: () => cpu.op.JSR(cpu.addr.abs()) },
        0x21: { execute: () => cpu.op.AND(cpu.addr.indx()) },
        0x24: { execute: () => cpu.op.BIT(cpu.addr.zp()) },
        0x25: { execute: () => cpu.op.AND(cpu.addr.zp()) },
        0x26: { execute: () => cpu.op.ROL(cpu.addr.zp()) },
        0x28: { execute: () => cpu.op.PLP() },
        0x29: { execute: () => cpu.op.AND(cpu.addr.imm()) },
        0x2A: { execute: () => cpu.op.ROL_A() },
        0x2C: { execute: () => cpu.op.BIT(cpu.addr.abs()) },
        0x2D: { execute: () => cpu.op.AND(cpu.addr.abs()) },
        0x2E: { execute: () => cpu.op.ROL(cpu.addr.abs()) },

        // Row 0x3_
        0x30: { execute: () => cpu.op.BMI() },
        0x31: { execute: () => cpu.op.AND(cpu.addr.indy()) },
        0x35: { execute: () => cpu.op.AND(cpu.addr.zpx()) },
        0x36: { execute: () => cpu.op.ROL(cpu.addr.zpx()) },
        0x38: { execute: () => cpu.op.SEC() },
        0x39: { execute: () => cpu.op.AND(cpu.addr.absy()) },
        0x3D: { execute: () => cpu.op.AND(cpu.addr.absx()) },
        0x3E: { execute: () => cpu.op.ROL(cpu.addr.absx()) },

        // Row 0x4_
        0x40: { execute: () => { /* RTI */ cpu.status = cpu.pop() & 0xEF; cpu.pc = cpu.pop16(); } },
        0x41: { execute: () => cpu.op.EOR(cpu.addr.indx()) },
        0x45: { execute: () => cpu.op.EOR(cpu.addr.zp()) },
        0x46: { execute: () => cpu.op.LSR(cpu.addr.zp()) },
        0x48: { execute: () => cpu.op.PHA() },
        0x49: { execute: () => cpu.op.EOR(cpu.addr.imm()) },
        0x4A: { execute: () => cpu.op.LSR_A() },
        0x4C: { execute: () => cpu.op.JMP(cpu.addr.abs()) },
        0x4D: { execute: () => cpu.op.EOR(cpu.addr.abs()) },
        0x4E: { execute: () => cpu.op.LSR(cpu.addr.abs()) },

        // Row 0x5_
        0x50: { execute: () => cpu.op.BVC() },
        0x51: { execute: () => cpu.op.EOR(cpu.addr.indy()) },
        0x55: { execute: () => cpu.op.EOR(cpu.addr.zpx()) },
        0x56: { execute: () => cpu.op.LSR(cpu.addr.zpx()) },
        0x58: { execute: () => cpu.op.CLI() },
        0x59: { execute: () => cpu.op.EOR(cpu.addr.absy()) },
        0x5D: { execute: () => cpu.op.EOR(cpu.addr.absx()) },
        0x5E: { execute: () => cpu.op.LSR(cpu.addr.absx()) },

        // Row 0x6_
        0x60: { execute: () => cpu.op.RTS() },
        0x61: { execute: () => cpu.op.ADC(cpu.addr.indx()) },
        0x65: { execute: () => cpu.op.ADC(cpu.addr.zp()) },
        0x66: { execute: () => cpu.op.ROR(cpu.addr.zp()) },
        0x68: { execute: () => cpu.op.PLA() },
        0x69: { execute: () => cpu.op.ADC(cpu.addr.imm()) },
        0x6A: { execute: () => cpu.op.ROR_A() },
        0x6C: { execute: () => cpu.op.JMP(cpu.addr.ind()) },
        0x6D: { execute: () => cpu.op.ADC(cpu.addr.abs()) },
        0x6E: { execute: () => cpu.op.ROR(cpu.addr.abs()) },

        // Row 0x7_
        0x70: { execute: () => cpu.op.BVS() },
        0x71: { execute: () => cpu.op.ADC(cpu.addr.indy()) },
        0x75: { execute: () => cpu.op.ADC(cpu.addr.zpx()) },
        0x76: { execute: () => cpu.op.ROR(cpu.addr.zpx()) },
        0x78: { execute: () => cpu.op.SEI() },
        0x79: { execute: () => cpu.op.ADC(cpu.addr.absy()) },
        0x7D: { execute: () => cpu.op.ADC(cpu.addr.absx()) },
        0x7E: { execute: () => cpu.op.ROR(cpu.addr.absx()) },

        // Row 0x8_
        0x81: { execute: () => cpu.op.STA(cpu.addr.indx()) },
        0x84: { execute: () => cpu.op.STY(cpu.addr.zp()) },
        0x85: { execute: () => cpu.op.STA(cpu.addr.zp()) },
        0x86: { execute: () => cpu.op.STX(cpu.addr.zp()) },
        0x88: { execute: () => cpu.op.DEY() },
        0x8A: { execute: () => cpu.op.TXA() },
        0x8C: { execute: () => cpu.op.STY(cpu.addr.abs()) },
        0x8D: { execute: () => cpu.op.STA(cpu.addr.abs()) },
        0x8E: { execute: () => cpu.op.STX(cpu.addr.abs()) },

        // Row 0x9_
        0x90: { execute: () => cpu.op.BCC() },
        0x91: { execute: () => cpu.op.STA(cpu.addr.indy()) },
        0x94: { execute: () => cpu.op.STY(cpu.addr.zpx()) },
        0x95: { execute: () => cpu.op.STA(cpu.addr.zpx()) },
        0x96: { execute: () => cpu.op.STX(cpu.addr.zpy()) },
        0x98: { execute: () => cpu.op.TYA() },
        0x99: { execute: () => cpu.op.STA(cpu.addr.absy()) },
        0x9A: { execute: () => cpu.op.TXS() },
        0x9D: { execute: () => cpu.op.STA(cpu.addr.absx()) },

        // Row 0xA_
        0xA0: { execute: () => cpu.op.LDY(cpu.addr.imm()) },
        0xA1: { execute: () => cpu.op.LDA(cpu.addr.indx()) },
        0xA2: { execute: () => cpu.op.LDX(cpu.addr.imm()) },
        0xA4: { execute: () => cpu.op.LDY(cpu.addr.zp()) },
        0xA5: { execute: () => cpu.op.LDA(cpu.addr.zp()) },
        0xA6: { execute: () => cpu.op.LDX(cpu.addr.zp()) },
        0xA8: { execute: () => cpu.op.TAY() },
        0xA9: { execute: () => cpu.op.LDA(cpu.addr.imm()) },
        0xAA: { execute: () => cpu.op.TAX() },
        0xAC: { execute: () => cpu.op.LDY(cpu.addr.abs()) },
        0xAD: { execute: () => cpu.op.LDA(cpu.addr.abs()) },
        0xAE: { execute: () => cpu.op.LDX(cpu.addr.abs()) },

        // Row 0xB_
        0xB0: { execute: () => cpu.op.BCS() },
        0xB1: { execute: () => cpu.op.LDA(cpu.addr.indy()) },
        0xB4: { execute: () => cpu.op.LDY(cpu.addr.zpx()) },
        0xB5: { execute: () => cpu.op.LDA(cpu.addr.zpx()) },
        0xB6: { execute: () => cpu.op.LDX(cpu.addr.zpy()) },
        0xB8: { execute: () => cpu.op.CLV() },
        0xB9: { execute: () => cpu.op.LDA(cpu.addr.absy()) },
        0xBA: { execute: () => cpu.op.TSX() },
        0xBC: { execute: () => cpu.op.LDY(cpu.addr.absx()) },
        0xBD: { execute: () => cpu.op.LDA(cpu.addr.absx()) },
        0xBE: { execute: () => cpu.op.LDX(cpu.addr.absy()) },

        // Row 0xC_
        0xC0: { execute: () => cpu.op.CPY(cpu.addr.imm()) },
        0xC1: { execute: () => cpu.op.CMP(cpu.addr.indx()) },
        0xC4: { execute: () => cpu.op.CPY(cpu.addr.zp()) },
        0xC5: { execute: () => cpu.op.CMP(cpu.addr.zp()) },
        0xC6: { execute: () => cpu.op.DEC(cpu.addr.zp()) },
        0xC8: { execute: () => cpu.op.INY() },
        0xC9: { execute: () => cpu.op.CMP(cpu.addr.imm()) },
        0xCA: { execute: () => cpu.op.DEX() },
        0xCC: { execute: () => cpu.op.CPY(cpu.addr.abs()) },
        0xCD: { execute: () => cpu.op.CMP(cpu.addr.abs()) },
        0xCE: { execute: () => cpu.op.DEC(cpu.addr.abs()) },

        // Row 0xD_
        0xD0: { execute: () => cpu.op.BNE() },
        0xD1: { execute: () => cpu.op.CMP(cpu.addr.indy()) },
        0xD5: { execute: () => cpu.op.CMP(cpu.addr.zpx()) },
        0xD6: { execute: () => cpu.op.DEC(cpu.addr.zpx()) },
        0xD8: { execute: () => cpu.op.CLD() },
        0xD9: { execute: () => cpu.op.CMP(cpu.addr.absy()) },
        0xDD: { execute: () => cpu.op.CMP(cpu.addr.absx()) },
        0xDE: { execute: () => cpu.op.DEC(cpu.addr.absx()) },

        // Row 0xE_
        0xE0: { execute: () => cpu.op.CPX(cpu.addr.imm()) },
        0xE1: { execute: () => cpu.op.SBC(cpu.addr.indx()) },
        0xE4: { execute: () => cpu.op.CPX(cpu.addr.zp()) },
        0xE5: { execute: () => cpu.op.SBC(cpu.addr.zp()) },
        0xE6: { execute: () => cpu.op.INC(cpu.addr.zp()) },
        0xE8: { execute: () => cpu.op.INX() },
        0xE9: { execute: () => cpu.op.SBC(cpu.addr.imm()) },
        0xEA: { execute: () => { /* NOP */ } },
        0xEC: { execute: () => cpu.op.CPX(cpu.addr.abs()) },
        0xED: { execute: () => cpu.op.SBC(cpu.addr.abs()) },
        0xEE: { execute: () => cpu.op.INC(cpu.addr.abs()) },

        // Row 0xF_
        0xF0: { execute: () => cpu.op.BEQ() },
        0xF1: { execute: () => cpu.op.SBC(cpu.addr.indy()) },
        0xF5: { execute: () => cpu.op.SBC(cpu.addr.zpx()) },
        0xF6: { execute: () => cpu.op.INC(cpu.addr.zpx()) },
        0xF8: { execute: () => cpu.op.SED() },
        0xF9: { execute: () => cpu.op.SBC(cpu.addr.absy()) },
        0xFD: { execute: () => cpu.op.SBC(cpu.addr.absx()) },
        0xFE: { execute: () => cpu.op.INC(cpu.addr.absx()) },
    });

    let cra = 0, crb = 0;
    let ddrb_written = false;
    let suppressNextCR = false;
    let displayBuffer = [];
    let hasReplacedStartupPrompt = false;

    // --- Progress Bar Functions ---
    let progressTimeout;
    function showProgress(message) {
        clearTimeout(progressTimeout);
        progressStatus.textContent = message || '';
        progressBar.style.width = '0%';
        progressContainer.style.display = 'block';
    }

    function updateProgress(percent, message) {
        progressBar.style.width = `${percent}%`;
        if (message) {
            progressStatus.textContent = message;
        }
    }

    function showFinalStatus(message, isError) {
        progressStatus.textContent = message;
        progressBar.style.width = isError ? '100%' : progressBar.style.width;
        progressBar.style.backgroundColor = isError ? '#f00' : '#0f0';

        clearTimeout(progressTimeout);
        progressTimeout = setTimeout(() => {
            progressContainer.style.display = 'none';
            progressBar.style.backgroundColor = '#0f0'; // Reset color
        }, isError ? 5000 : 3000);
    }
    // ----------------------------

    function updateDisplay() {
        if (displayBuffer.length > 0) {
            const char = displayBuffer.shift();

            if (char === 'BACKSPACE') {
                const lastChar = output.textContent.slice(-1);
                if (lastChar !== '\n' && lastChar !== '\r') {
                     output.textContent = output.textContent.slice(0, -1);
                }
            } else if (char === '\n') {
                 const lastLine = output.textContent.substring(output.textContent.lastIndexOf('\n') + 1);
                 if (lastLine !== '') {
                    output.textContent += '\n';
                 }
            } else {
                output.textContent += char;
            }
            output.scrollTop = output.scrollHeight;
        }
    }

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

                if (suppressNextCR && charCode === 0x0D) {
                    suppressNextCR = false;
                    return; // Swallow the CR that follows the Wozmon prompt
                }

                // Replace Wozmon's '\' prompt with 'READY' only on first occurrence (startup)
                if (charCode === 0x5C && !hasReplacedStartupPrompt) { // Wozmon's '\' prompt
                    displayBuffer.push(...'READY\n');
                    suppressNextCR = true;
                    hasReplacedStartupPrompt = true;
                    return;
                }

                // Wozmon echoes '_' ($5F) for the backspace key ($DF). We intercept it.
                if (charCode === 0x5F) {
                    displayBuffer.push('BACKSPACE');
                    
                    // Hacky Workaround:
                    // Make Wozmon's backspace destructive by clearing the character and
                    // the echoed backspace from RAM. We replace them with spaces ($20), 
                    // which the Wozmon parser ignores.
                    const backspaceCharAddr = 0x0200 + cpu.y;
                    const previousCharAddr = backspaceCharAddr - 1;

                    if (previousCharAddr >= 0x0200) {
                        ram[previousCharAddr] = 0x20; // Erase previous character
                        ram[backspaceCharAddr] = 0x20; // Erase the '_'
                    }
                    
                    return; // Don't print the '_'
                }
                
                if (charCode === 0x0D) { // Carriage Return
                    displayBuffer.push('\n');
                } else if (charCode >= 0x20 && charCode <= 0x7E) { // Printable ASCII
                    displayBuffer.push(String.fromCharCode(charCode));
                }
            }
            return;
        }
        ram[addr] = val;
    }

    function loadTestProgram() {
        // Load a simple test program that should work
        // This program prints "HELLO" and returns to Wozmon
        const testProgram = [
            0xA9, 0xC8,        // LDA #$C8 ('H')
            0x20, 0xEF, 0xFF,  // JSR $FFEF (Wozmon print char)
            0xA9, 0xC5,        // LDA #$C5 ('E') 
            0x20, 0xEF, 0xFF,  // JSR $FFEF
            0xA9, 0xCC,        // LDA #$CC ('L')
            0x20, 0xEF, 0xFF,  // JSR $FFEF
            0xA9, 0xCC,        // LDA #$CC ('L')
            0x20, 0xEF, 0xFF,  // JSR $FFEF
            0xA9, 0xCF,        // LDA #$CF ('O')
            0x20, 0xEF, 0xFF,  // JSR $FFEF
            0xA9, 0x8D,        // LDA #$8D (CR)
            0x20, 0xEF, 0xFF,  // JSR $FFEF
            0x00               // BRK (return to Wozmon)
        ];
        
        console.log('Loading simple test program at $0300...');
        testProgram.forEach((byte, index) => {
            write(0x0300 + index, byte);
        });
        
        console.log('Test program loaded. Type "300R" to run it.');
        console.log('Expected output: HELLO followed by return to Wozmon');
        console.log('Use Ctrl+Shift+T to reload this test program anytime.');
        
        // Clear any existing data protection
        dataLoadedAt = null;
    }

    function loadFromClipboard() {
        showProgress('Loading from clipboard...');
        navigator.clipboard.readText().then(text => {
            const lines = text.split('\n');
            let bytesLoaded = 0;
            let currentAddr = 0; // Keep track of the last address
            try {
                lines.forEach((line, index) => {
                    line = line.trim();
                    if (!line) return;

                    let parts;
                    let byteStrings;

                    if (line.startsWith(':')) {
                        // This is a continuation line
                        parts = [null, line.substring(1)]; // No address part
                        if (currentAddr === 0) throw new Error(`Continuation line found with no preceding address: "${line}"`);
                    } else {
                        parts = line.split(':');
                        if (parts.length !== 2) throw new Error(`Invalid line format: "${line}"`);
                        const addr = parseInt(parts[0], 16);
                        if (isNaN(addr)) throw new Error(`Invalid address: "${parts[0]}"`);
                        currentAddr = addr;
                    }

                    byteStrings = parts[1].trim().split(/\s+/);
                    byteStrings.forEach(byteString => {
                        if (!byteString) return;
                        const byte = parseInt(byteString, 16);
                        if (isNaN(byte)) throw new Error(`Invalid byte: "${byteString}"`);
                        write(currentAddr, byte);
                        currentAddr++;
                        bytesLoaded++;
                    });
                    updateProgress((index / lines.length) * 100);
                });
                showFinalStatus(`${bytesLoaded} bytes loaded successfully from clipboard.`);
            } catch (error) {
                showFinalStatus(`Error: ${error.message}`, true);
            }
        }).catch(err => {
            showFinalStatus('Failed to read clipboard contents.', true);
            console.error('Clipboard read failed: ', err);
        });
    }

    let lastPc = 0;
    let stuckCount = 0;
    let debugMode = true;
    let executionEnabled = true;
    let dataLoadedAt = null;

    // Helper function to get instruction name for debugging
    function getInstructionName(opcode) {
        const opcodeMap = {
            // ADC
            0x69: 'ADC #', 0x65: 'ADC zp', 0x75: 'ADC zp,X', 0x6D: 'ADC abs', 0x7D: 'ADC abs,X', 0x79: 'ADC abs,Y', 0x61: 'ADC (ind,X)', 0x71: 'ADC (ind),Y',
            // AND
            0x29: 'AND #', 0x25: 'AND zp', 0x35: 'AND zp,X', 0x2D: 'AND abs', 0x3D: 'AND abs,X', 0x39: 'AND abs,Y', 0x21: 'AND (ind,X)', 0x31: 'AND (ind),Y',
            // ASL
            0x0A: 'ASL A', 0x06: 'ASL zp', 0x16: 'ASL zp,X', 0x0E: 'ASL abs', 0x1E: 'ASL abs,X',
            // Branch
            0x90: 'BCC', 0xB0: 'BCS', 0xF0: 'BEQ', 0x30: 'BMI', 0xD0: 'BNE', 0x10: 'BPL', 0x50: 'BVC', 0x70: 'BVS',
            // BIT
            0x24: 'BIT zp', 0x2C: 'BIT abs',
            // BRK
            0x00: 'BRK',
            // Clear
            0x18: 'CLC', 0xD8: 'CLD', 0x58: 'CLI', 0xB8: 'CLV',
            // Compare
            0xC9: 'CMP #', 0xC5: 'CMP zp', 0xD5: 'CMP zp,X', 0xCD: 'CMP abs', 0xDD: 'CMP abs,X', 0xD9: 'CMP abs,Y', 0xC1: 'CMP (ind,X)', 0xD1: 'CMP (ind),Y',
            0xE0: 'CPX #', 0xE4: 'CPX zp', 0xEC: 'CPX abs',
            0xC0: 'CPY #', 0xC4: 'CPY zp', 0xCC: 'CPY abs',
            // Decrement
            0xC6: 'DEC zp', 0xD6: 'DEC zp,X', 0xCE: 'DEC abs', 0xDE: 'DEC abs,X',
            0xCA: 'DEX', 0x88: 'DEY',
            // EOR
            0x49: 'EOR #', 0x45: 'EOR zp', 0x55: 'EOR zp,X', 0x4D: 'EOR abs', 0x5D: 'EOR abs,X', 0x59: 'EOR abs,Y', 0x41: 'EOR (ind,X)', 0x51: 'EOR (ind),Y',
            // Increment
            0xE6: 'INC zp', 0xF6: 'INC zp,X', 0xEE: 'INC abs', 0xFE: 'INC abs,X',
            0xE8: 'INX', 0xC8: 'INY',
            // Jumps
            0x4C: 'JMP abs', 0x6C: 'JMP (abs)', 0x20: 'JSR abs',
            // Load
            0xA9: 'LDA #', 0xA5: 'LDA zp', 0xB5: 'LDA zp,X', 0xAD: 'LDA abs', 0xBD: 'LDA abs,X', 0xB9: 'LDA abs,Y', 0xA1: 'LDA (ind,X)', 0xB1: 'LDA (ind),Y',
            0xA2: 'LDX #', 0xA6: 'LDX zp', 0xB6: 'LDX zp,Y', 0xAE: 'LDX abs', 0xBE: 'LDX abs,Y',
            0xA0: 'LDY #', 0xA4: 'LDY zp', 0xB4: 'LDY zp,X', 0xAC: 'LDY abs', 0xBC: 'LDY abs,X',
            // LSR
            0x4A: 'LSR A', 0x46: 'LSR zp', 0x56: 'LSR zp,X', 0x4E: 'LSR abs', 0x5E: 'LSR abs,X',
            // NOP
            0xEA: 'NOP',
            // ORA
            0x09: 'ORA #', 0x05: 'ORA zp', 0x15: 'ORA zp,X', 0x0D: 'ORA abs', 0x1D: 'ORA abs,X', 0x19: 'ORA abs,Y', 0x01: 'ORA (ind,X)', 0x11: 'ORA (ind),Y',
            // Push/Pull
            0x48: 'PHA', 0x08: 'PHP', 0x68: 'PLA', 0x28: 'PLP',
            // ROL
            0x2A: 'ROL A', 0x26: 'ROL zp', 0x36: 'ROL zp,X', 0x2E: 'ROL abs', 0x3E: 'ROL abs,X',
            // ROR
            0x6A: 'ROR A', 0x66: 'ROR zp', 0x76: 'ROR zp,X', 0x6E: 'ROR abs', 0x7E: 'ROR abs,X',
            // Return
            0x40: 'RTI', 0x60: 'RTS',
            // SBC
            0xE9: 'SBC #', 0xE5: 'SBC zp', 0xF5: 'SBC zp,X', 0xED: 'SBC abs', 0xFD: 'SBC abs,X', 0xF9: 'SBC abs,Y', 0xE1: 'SBC (ind,X)', 0xF1: 'SBC (ind),Y',
            // Set
            0x38: 'SEC', 0xF8: 'SED', 0x78: 'SEI',
            // Store
            0x85: 'STA zp', 0x95: 'STA zp,X', 0x8D: 'STA abs', 0x9D: 'STA abs,X', 0x99: 'STA abs,Y', 0x81: 'STA (ind,X)', 0x91: 'STA (ind),Y',
            0x86: 'STX zp', 0x96: 'STX zp,Y', 0x8E: 'STX abs',
            0x84: 'STY zp', 0x94: 'STY zp,X', 0x8C: 'STY abs',
            // Transfer
            0xAA: 'TAX', 0xA8: 'TAY', 0xBA: 'TSX', 0x8A: 'TXA', 0x9A: 'TXS', 0x98: 'TYA',
             // Illegal Opcodes
            0x82: 'NOP #(illegal)', 0x89: 'NOP #(illegal)', 0xC2: 'NOP #(illegal)', 0xE2: 'NOP #(illegal)', 0xB2: 'NOP(illegal)'
        };
        return opcodeMap[opcode] || `Unknown(${opcode.toString(16).padStart(2, '0')})`;
    }

    function run() {
        loadRom();
        cpu.reset();
        
        // A simple execution loop
        // In a real emulator, this would be more complex to manage timing.
        setInterval(() => {
            // Reduce execution speed to prevent browser slowdown
            // Real Apple I was 1MHz, but we'll run much slower for browser compatibility
            if (executionEnabled) {
                for (let i = 0; i < 100; i++) {
                    // Debug: Log when we start executing in user area
                    if (cpu.pc >= 0x0200 && cpu.pc < 0xFF00 && cpu.pc !== lastPc) {
                        const opcode = ram[cpu.pc];
                        const nextByte = ram[cpu.pc + 1];
                        const nextByte2 = ram[cpu.pc + 2];
                        console.log(`Executing at $${cpu.pc.toString(16).toUpperCase()}: opcode ${opcode.toString(16).padStart(2, '0')} ${nextByte.toString(16).padStart(2, '0')} ${nextByte2.toString(16).padStart(2, '0')}`);
                        
                        // Log what instruction this is
                        if (cpu.instructions[opcode]) {
                            const instrName = getInstructionName(opcode);
                            console.log(`  -> ${instrName}`);
                        }
                        
                        // Special warning if we're executing in the input buffer area
                        if (cpu.pc >= 0x0200 && cpu.pc < 0x0208) {
                            console.log(`WARNING: Executing in Apple I input buffer area ($200-$207) - this is unusual!`);
                            console.log(`Previous PC was: $${lastPc.toString(16).toUpperCase()}`);
                            console.log('EMERGENCY RESET: Corrupted execution detected, returning to Wozmon');
                            
                                                    // Immediate reset - don't wait for stuck detection
                        cpu.pc = 0xFF00;
                        cpu.sp = 0xFF;
                        lastPc = 0xFF00;
                        stuckCount = 0;
                        dataLoadedAt = null;
                        hasReplacedStartupPrompt = false; // Allow READY message on next startup
                            
                            // Fix corrupted IRQ vector
                            ram[0xFFFE] = 0x00;  // Low byte of $FF00 (Wozmon entry)
                            ram[0xFFFF] = 0xFF;  // High byte of $FF00
                            
                            console.log('System reset complete. The loaded cassette data is not valid 6502 executable code.');
                            break; // Exit the execution loop for this cycle
                        }
                        
                        // Also detect if we're executing in obviously corrupted areas
                        if (cpu.pc >= 0x0600 && cpu.pc < 0x0800 && ram[cpu.pc] === 0x00) {
                            console.log(`WARNING: Executing in likely corrupted area $${cpu.pc.toString(16).toUpperCase()} with BRK/zero bytes`);
                            console.log('This suggests memory corruption or invalid program data');
                        }
                    }
                    
                    // Prevent execution of loaded data (but allow if explicitly started with R command)
                    if (dataLoadedAt && cpu.pc >= dataLoadedAt.start && cpu.pc <= dataLoadedAt.end) {
                        console.log(`Data protection triggered at $${cpu.pc.toString(16).toUpperCase()}`);
                        console.log(`Data protection area: $${dataLoadedAt.start.toString(16).toUpperCase()}-$${dataLoadedAt.end.toString(16).toUpperCase()}`);
                        console.log('Use Ctrl+Shift+R to force execution, or this may be accidental execution of data');
                        cpu.pc = 0xFF00; // Jump back to Wozmon
                        dataLoadedAt = null; // Clear the protection
                        hasReplacedStartupPrompt = false; // Allow READY message on next startup
                        break;
                    }
                    cpu.step();
                }
            }
            
            // Check if CPU seems stuck
            if (cpu.pc === lastPc) {
                stuckCount++;
                if (stuckCount > 10) { // Reduce threshold to catch problems faster
                    // Check what kind of area we're stuck in
                    const inDataArea = dataLoadedAt && cpu.pc >= dataLoadedAt.start && cpu.pc <= dataLoadedAt.end;
                    const inLowMemory = cpu.pc < 0x0200;
                    const inUserArea = cpu.pc >= 0x0200 && cpu.pc < 0xFF00;
                    const inWozmon = cpu.pc >= 0xFF00;
                    
                    // Don't spam logs for normal Wozmon operation (especially keyboard polling)
                    const isWozmonKeyboardLoop = cpu.pc >= 0xFF20 && cpu.pc <= 0xFF40;
                    
                    if (!isWozmonKeyboardLoop) {
                        console.log(`CPU appears stuck at $${cpu.pc.toString(16).toUpperCase().padStart(4, '0')}`);
                        console.log('CPU State:', cpu.getState());
                        console.log(`Memory at PC: ${ram[cpu.pc].toString(16).padStart(2, '0')} ${ram[cpu.pc+1].toString(16).padStart(2, '0')} ${ram[cpu.pc+2].toString(16).padStart(2, '0')}`);
                        console.log(`PC location analysis: dataArea=${inDataArea}, lowMem=${inLowMemory}, userArea=${inUserArea}, wozmon=${inWozmon}`);
                    }
                    
                    // Auto-reset if stuck in protected data area, very low memory, or input buffer
                    if (inDataArea || inLowMemory || (cpu.pc >= 0x0200 && cpu.pc < 0x0208)) {
                        console.log('Auto-resetting CPU to Wozmon due to stuck execution in protected/invalid area.');
                        console.log('This suggests the loaded program is not valid 6502 executable code.');
                        cpu.pc = 0xFF00;
                        cpu.sp = 0xFF;
                        lastPc = 0xFF00;
                        dataLoadedAt = null; // Clear protection since we're resetting
                        hasReplacedStartupPrompt = false; // Allow READY message on next startup
                        
                        // Fix corrupted IRQ vector
                        ram[0xFFFE] = 0x00;  // Low byte of $FF00 (Wozmon entry)
                        ram[0xFFFF] = 0xFF;  // High byte of $FF00
                    } else if (inUserArea) {
                        console.log('CPU stuck in user area - this may be normal (waiting for input, infinite loop, etc.)');
                        console.log('Use Ctrl+R to manually reset if needed.');
                    } else if (inWozmon && !isWozmonKeyboardLoop) {
                        console.log('CPU stuck in Wozmon ROM - this may indicate a ROM bug or unusual condition.');
                    }
                    // Note: We never auto-reset when stuck in Wozmon area - this is normal operation
                    
                    stuckCount = 0; // Reset to avoid spam
                }
            } else {
                stuckCount = 0;
                lastPc = cpu.pc;
            }
        }, 16);

        setInterval(updateDisplay, 30);

        pasteButton.addEventListener('click', loadFromClipboard);
        
        // Test program shortcut is handled in the main handleKey function

        // Physical keyboard support
        document.addEventListener('keydown', handleKey);

        // Software keyboard support
        screen.addEventListener('click', () => {
            keyboardInput.focus({ preventScroll: true });
        });

        keyboardInput.addEventListener('keydown', (e) => {
            // Handle special keys that don't produce character output
            let appleCharCode;
            let handled = true;

            if (e.key === 'Backspace') {
                appleCharCode = 0xDF;
            } else if (e.key === 'Enter') {
                appleCharCode = 0x8D;
            } else {
                handled = false;
            }

            if (handled) {
                e.preventDefault();
                keyboardBuffer.push(appleCharCode | 0x80);
            }
        });

        keyboardInput.addEventListener('input', (e) => {
            const text = e.target.value;
            if (text) {
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    const appleCharCode = char.toUpperCase().charCodeAt(0);
                    keyboardBuffer.push(appleCharCode | 0x80);
                }
            }
            e.target.value = '';
        });
    }

    function handleKey(e) {
        // Ignore key events when the hidden input is focused, as they are handled separately.
        if (e.target === keyboardInput) {
            return;
        }

        // Special debug keys (don't pass to emulator)
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            console.log('Manual CPU reset triggered');
            cpu.pc = 0xFF00;
            cpu.sp = 0xFF;
            lastPc = 0xFF00;
            stuckCount = 0;
            dataLoadedAt = null;
            hasReplacedStartupPrompt = false; // Allow READY message on next startup
            return;
        }
        
        // Force run loaded data as code (override detection)
        if (e.ctrlKey && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            if (dataLoadedAt) {
                console.log(`Force running loaded data at $${dataLoadedAt.start.toString(16).toUpperCase()} as executable code`);
                cpu.pc = dataLoadedAt.start;
                cpu.sp = 0xFF;
                lastPc = dataLoadedAt.start;
                stuckCount = 0;
                dataLoadedAt = null; // Clear protection
                return;
            } else {
                console.log('No data loaded to force run');
            }
            return;
        }
        
        // Pause/Resume execution
        if (e.ctrlKey && e.key === 'p') {
            e.preventDefault();
            executionEnabled = !executionEnabled;
            console.log(`CPU execution ${executionEnabled ? 'resumed' : 'paused'}`);
            return;
        }
        
        // Debug memory dump
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            console.log('=== DEBUG INFO ===');
            console.log(`CPU State:`, cpu.getState());
            console.log(`Data protection: ${dataLoadedAt ? `$${dataLoadedAt.start.toString(16).toUpperCase()}-$${dataLoadedAt.end.toString(16).toUpperCase()}` : 'None'}`);
            
            // Dump memory around current PC
            const dumpAddr = cpu.pc & 0xFFF0; // Align to 16-byte boundary
            console.log(`\nMemory dump around PC ($${cpu.pc.toString(16).toUpperCase()}):`);
            for (let i = 0; i < 64; i += 16) {
                const addr = dumpAddr + i;
                let line = `$${addr.toString(16).toUpperCase().padStart(4, '0')}: `;
                let ascii = '';
                for (let j = 0; j < 16; j++) {
                    const byte = ram[addr + j];
                    line += byte.toString(16).toUpperCase().padStart(2, '0') + ' ';
                    ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
                }
                console.log(line + '| ' + ascii);
            }
            return;
        }
        
        // Load test program
        if (e.ctrlKey && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            loadTestProgram();
            return;
        }

        e.preventDefault();
        const char = e.key;
        let appleCharCode;

        if (char === 'Backspace') {
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
