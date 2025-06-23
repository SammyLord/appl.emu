document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const keyboardInput = document.getElementById('keyboard-input');
    const screen = document.getElementById('screen');
    const pasteButton = document.getElementById('paste-button');
    const tapeButton = document.getElementById('tape-button');
    const tapeFileInput = document.getElementById('tape-file-input');
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
            PHP: () => cpu.push(cpu.status | 0x10), PLP: () => { cpu.status = cpu.pop() | 0x20; },
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
            console.log(`BRK instruction at $${(cpu.pc - 1).toString(16).toUpperCase()}`);
            const irqVector = cpu.read16(0xFFFE);
            console.log(`IRQ vector points to $${irqVector.toString(16).toUpperCase()}`);
            
            // Check if we have a valid IRQ handler
            if (irqVector === 0x0000 || irqVector === 0xFFFF) {
                console.log('No valid IRQ handler found, treating BRK as NOP');
                // Just continue execution instead of jumping to invalid handler
                return;
            }
            
            // For Apple I programs, BRK should properly vector through the IRQ handler
            // Let the IRQ handler decide what to do (it might return to the program or go to Wozmon)
            console.log('Executing BRK - vectoring through IRQ handler');
            cpu.push16(cpu.pc + 1); 
            cpu.push(cpu.status | 0x10); 
            cpu.setI(true); 
            cpu.pc = irqVector; 
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

                // Replace Wozmon's '\' prompt with 'READY'
                if (charCode === 0x5C) { // Wozmon's '\' prompt
                    displayBuffer.push(...'READY\n');
                    suppressNextCR = true;
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

    function loadFromClipboard() {
        showProgress('Loading from clipboard...');
        navigator.clipboard.readText().then(text => {
            const lines = text.split('\n');
            let bytesLoaded = 0;
            try {
                lines.forEach((line, index) => {
                    line = line.trim();
                    if (!line) return;

                    const parts = line.split(':');
                    if (parts.length !== 2) throw new Error(`Invalid line format: "${line}"`);
                    
                    let addr = parseInt(parts[0], 16);
                    if (isNaN(addr)) throw new Error(`Invalid address: "${parts[0]}"`);

                    const byteStrings = parts[1].trim().split(/\s+/);
                    byteStrings.forEach(byteString => {
                        if (!byteString) return;
                        const byte = parseInt(byteString, 16);
                        if (isNaN(byte)) throw new Error(`Invalid byte: "${byteString}"`);
                        write(addr, byte);
                        addr++;
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

    function loadFromCassette() {
        // This function will be called when the user selects a file.
        const file = tapeFileInput.files[0];
        if (!file) {
            return;
        }

        showProgress(`Loading from: ${file.name}`);

        const reader = new FileReader();
        reader.onload = (e) => {
            const audioData = e.target.result;
            decodeTapeAudio(audioData);
        };
        reader.onerror = (e) => {
            showFinalStatus('Error reading file.', true);
        };
        reader.readAsArrayBuffer(file);
    }

    async function decodeTapeAudio(arrayBuffer) {
        try {
            updateProgress(10, 'Decoding audio file...');
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const data = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;

            updateProgress(20, 'Analyzing Apple I cassette format...');
            
            console.log(`Audio file: ${data.length} samples at ${sampleRate}Hz (${(data.length/sampleRate).toFixed(1)}s)`);
            
            // Apple I used a variant of Kansas City Standard with specific timing
            // Standard KCS: 0=4 cycles of 1200Hz, 1=8 cycles of 2400Hz  
            // But Apple I implementation had variations in timing and thresholds
            
            // Detect zero crossings with improved noise filtering
            const crossings = [];
            const threshold = 0.02; // Lower threshold for older tapes
            let lastSign = data[0] >= 0 ? 1 : -1;
            
            for (let i = 1; i < data.length; i++) {
                if (Math.abs(data[i]) > threshold) {
                    const currentSign = data[i] >= 0 ? 1 : -1;
                    if (currentSign !== lastSign) {
                        crossings.push(i);
                        lastSign = currentSign;
                    }
                }
            }

            console.log(`Found ${crossings.length} zero crossings`);
            
            if (crossings.length < 1000) {
                throw new Error("Insufficient audio signal detected. Check audio quality.");
            }

            updateProgress(40, 'Decoding Apple I bit patterns...');
            
            // Revert to frequency-based analysis since we know the tape has good frequency data
            // From previous analysis: 800Hz, 1000Hz, 2000Hz peaks detected
            const bits = [];
            const frequencies = [];
            
            // Calculate frequencies from zero crossings
            for (let i = 0; i < crossings.length - 2; i++) {
                const period = crossings[i + 2] - crossings[i]; // Full cycle = 2 zero crossings
                
                if (period > 0 && period < sampleRate / 100) { // Valid period range (>100Hz)
                    const frequency = sampleRate / period;
                    frequencies.push(frequency);
                    
                    // Try inverted polarity - sometimes Apple I tapes have inverted encoding
                    // High frequency (2000Hz) = '1' bit 
                    // Low frequency (800Hz, 1000Hz) = '0' bit
                    // Use 1400Hz as threshold (between 1000Hz and 2000Hz)
                    
                    if (frequency < 1400) {
                        bits.push(0); // Lower frequencies (800Hz, 1000Hz) = '0' bit
                    } else {
                        bits.push(1); // Higher frequencies (2000Hz) = '1' bit  
                    }
                }
            }
            
            console.log(`Detected ${bits.length} bits from frequency analysis`);
            
            // Debug: Show frequency distribution
            const freqHist = {};
            frequencies.forEach(f => {
                const bucket = Math.round(f / 100) * 100;
                freqHist[bucket] = (freqHist[bucket] || 0) + 1;
            });
            console.log('Frequency distribution (100Hz buckets):');
            Object.keys(freqHist).sort((a, b) => freqHist[b] - freqHist[a]).slice(0, 10).forEach(freq => {
                console.log(`  ${freq}Hz: ${freqHist[freq]} occurrences`);
            });
            
            // Debug: Show bit pattern samples
            console.log('Bit pattern samples:');
            for (let i = 0; i < Math.min(5, Math.floor(bits.length / 1000)); i++) {
                const start = i * 1000;
                const sample = bits.slice(start, start + 50).join('');
                console.log(`Bits ${start}-${start + 49}: ${sample}`);
            }
            
            if (bits.length < 500) {
                throw new Error("Insufficient bit patterns detected for Apple I format.");
            }

            updateProgress(60, 'Searching for Apple I sync pattern...');
            
            // Apple I sync detection: Look for end of long leader tone
            let syncPos = -1;
            
            // Look for a substantial leader tone (hundreds/thousands of 1s) followed by data transitions
            for (let i = 1000; i < bits.length - 200; i++) { // Start search after initial leader
                // Check if we have a long run of 1s ending here
                let leaderLength = 0;
                for (let j = i - 1; j >= 0 && bits[j] === 1; j--) {
                    leaderLength++;
                    if (leaderLength > 2000) break; // Don't count forever
                }
                
                // If we found a substantial leader (at least 100 bits) and now see data transitions
                if (leaderLength >= 100 && bits[i] === 0) {
                    // Check that we have mixed data after this point (not just more leader)
                    let zeroCount = 0, oneCount = 0;
                    for (let j = i; j < Math.min(i + 200, bits.length); j++) {
                        if (bits[j] === 0) zeroCount++;
                        else oneCount++;
                    }
                    
                                         // We want a good mix of 0s and 1s (actual data, not just leader)
                     if (zeroCount > 20 && oneCount > 20) {
                         syncPos = i;
                         console.log(`Found leader (${leaderLength} ones) ending at bit ${i}, data starts at ${syncPos}`);
                         
                         // Debug: Show bit pattern around sync point
                         console.log('Bit pattern around sync point:');
                         const showStart = Math.max(0, syncPos - 25);
                         const showEnd = Math.min(bits.length, syncPos + 75);
                         for (let k = showStart; k < showEnd; k += 50) {
                             const chunk = bits.slice(k, Math.min(k + 50, showEnd)).join('');
                             const marker = (k <= syncPos && syncPos < k + 50) ? ` <-- SYNC at ${syncPos}` : '';
                             console.log(`Bits ${k}-${Math.min(k + 49, showEnd - 1)}: ${chunk}${marker}`);
                         }
                         break;
                     }
                }
            }
            
            if (syncPos === -1) {
                // Fallback: Look for the BEST mixed data section (most balanced 0s and 1s)
                let bestMixPos = -1;
                let bestMixScore = 0;
                
                for (let i = 500; i < bits.length - 400; i += 50) { // Sample every 50 bits, need more room
                    let zeroCount = 0, oneCount = 0;
                    for (let j = i; j < Math.min(i + 400, bits.length); j++) { // Look at 400 bits
                        if (bits[j] === 0) zeroCount++;
                        else oneCount++;
                    }
                    
                    // Score based on how balanced the 0s and 1s are (closer to 50/50 is better)
                    if (zeroCount > 50 && oneCount > 50) { // Need substantial amounts of both
                        const balance = 1.0 - Math.abs(zeroCount - oneCount) / (zeroCount + oneCount);
                        const mixScore = balance * (zeroCount + oneCount); // Favor balanced AND substantial data
                        
                        if (mixScore > bestMixScore) {
                            bestMixScore = mixScore;
                            bestMixPos = i;
                        }
                    }
                }
                
                if (bestMixPos !== -1) {
                    syncPos = bestMixPos;
                    // Recount for logging
                    let zeroCount = 0, oneCount = 0;
                    for (let j = syncPos; j < Math.min(syncPos + 400, bits.length); j++) {
                        if (bits[j] === 0) zeroCount++;
                        else oneCount++;
                    }
                    console.log(`Best mixed data found at bit ${syncPos} (${zeroCount} zeros, ${oneCount} ones in next 400 bits, balance score: ${bestMixScore.toFixed(2)})`);
                    
                    // Debug: Show bit pattern around this better sync point
                    console.log('Bit pattern around best sync point:');
                    const showStart = Math.max(0, syncPos - 25);
                    const showEnd = Math.min(bits.length, syncPos + 75);
                    for (let k = showStart; k < showEnd; k += 50) {
                        const chunk = bits.slice(k, Math.min(k + 50, showEnd)).join('');
                        const marker = (k <= syncPos && syncPos < k + 50) ? ` <-- SYNC at ${syncPos}` : '';
                        console.log(`Bits ${k}-${Math.min(k + 49, showEnd - 1)}: ${chunk}${marker}`);
                    }
                }
            }
            
            if (syncPos === -1 || syncPos >= bits.length - 100) {
                throw new Error("Could not locate Apple I sync pattern.");
            }

            updateProgress(75, 'Decoding Apple I data format...');
            
            // Apple I byte decoding with multiple format attempts
            const formatAttempts = [
                // Apple I standard: start bit + 8 data bits + 2 stop bits
                { name: 'Apple I Standard', startBits: 1, dataBits: 8, stopBits: 2, expectStart: 0, expectStop: 1 },
                // Variations for degraded tapes
                { name: 'Apple I Relaxed', startBits: 1, dataBits: 8, stopBits: 1, expectStart: 0, expectStop: 1 },
                { name: 'Apple I No Start', startBits: 0, dataBits: 8, stopBits: 2, expectStart: null, expectStop: 1 },
                // Raw 8-bit in case framing is completely lost
                { name: 'Raw 8-bit', startBits: 0, dataBits: 8, stopBits: 0, expectStart: null, expectStop: null }
            ];
            
            let bestResult = null;
            let bestScore = 0;
            
            // Try different bit alignments in case we're off by a few bits
            for (let bitOffset = 0; bitOffset < 8; bitOffset++) {
                for (const format of formatAttempts) {
                    const result = decodeAppleIFormat(bits, syncPos + bitOffset, format, sampleRate);
                    
                    // Score based on: bytes decoded, Apple I format validity, data patterns
                    let score = result.bytes.length;
                    if (result.validAppleI) score += 1000;
                    if (result.hasValidCode) score += 500;
                    score -= result.errors * 10;
                    
                    // Bonus for fewer illegal opcodes
                    if (result.bytes.length > 10) {
                        const validOpcodes = new Set(Object.keys(cpu.instructions).map(k => parseInt(k)));
                        let legalOpcodes = 0;
                        for (let i = 0; i < Math.min(32, result.bytes.length); i++) {
                            if (validOpcodes.has(result.bytes[i]) && cpu.instructions[result.bytes[i]].execute.toString().indexOf('Unimplemented') === -1) {
                                legalOpcodes++;
                            }
                        }
                        const legalPercent = legalOpcodes / Math.min(32, result.bytes.length);
                        score += legalPercent * 200; // Bonus for legal opcodes
                    }
                    
                    const formatName = `${format.name} (offset +${bitOffset})`;
                    console.log(`Format ${formatName}: ${result.bytes.length} bytes, score: ${score}, Apple I: ${result.validAppleI}, errors: ${result.errors}`);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestResult = result;
                        bestResult.formatName = formatName;
                    }
                }
            }
            
            if (!bestResult || bestResult.bytes.length < 4) {
                throw new Error("Could not decode Apple I data format from tape.");
            }
            
            console.log(`Best format: ${bestResult.formatName || bestResult.format.name} with ${bestResult.bytes.length} bytes`);
            
            // Debug: Show decoded bytes
            console.log('First 32 decoded bytes:');
            const firstBytes = bestResult.bytes.slice(0, 32);
            let hexStr = '';
            let asciiStr = '';
            firstBytes.forEach((byte, i) => {
                hexStr += byte.toString(16).padStart(2, '0').toUpperCase() + ' ';
                asciiStr += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
                if ((i + 1) % 16 === 0) {
                    console.log(`${hexStr} | ${asciiStr}`);
                    hexStr = '';
                    asciiStr = '';
                }
            });
            if (hexStr) {
                console.log(`${hexStr.padEnd(48)} | ${asciiStr}`);
            }
            
            updateProgress(90, 'Loading Apple I program...');
            
            // Process the decoded bytes
            const bytes = bestResult.bytes;
            let startAddr, endAddr, programData;
            
            if (bestResult.validAppleI && bytes.length >= 5) {
                // Valid Apple I format detected
                startAddr = bytes[0] | (bytes[1] << 8);
                endAddr = bytes[2] | (bytes[3] << 8);
                const dataLength = endAddr - startAddr + 1;
                
                console.log(`Apple I format: Start=$${startAddr.toString(16).toUpperCase()}, End=$${endAddr.toString(16).toUpperCase()}, Length=${dataLength}`);
                
                // Debug: Show more bytes to analyze the format
                console.log('First 16 bytes for Apple I analysis:');
                const first16 = bytes.slice(0, 16);
                let hexStr = '';
                first16.forEach((byte, i) => {
                    hexStr += byte.toString(16).padStart(2, '0').toUpperCase() + ' ';
                });
                console.log(hexStr);
                
                if (dataLength > 0 && dataLength <= bytes.length - 5) {
                    // Check if this looks like a suspicious result (very small program with duplicated addresses)
                    if (dataLength <= 3 && bytes[0] === bytes[2] && bytes[1] === bytes[3]) {
                        console.log(`Suspicious small program (${dataLength} bytes) with duplicated addresses - trying alternatives...`);
                        // Jump to alternative interpretation
                    } else {
                        programData = bytes.slice(4, 4 + dataLength);
                        
                        // Verify checksum if present
                        if (bytes.length >= 5 + dataLength) {
                            const checksum = bytes[4 + dataLength];
                            let sum = 0;
                            programData.forEach(byte => sum += byte);
                            
                            if ((sum & 0xFF) === checksum) {
                                console.log('Apple I checksum verified!');
                            } else {
                                console.log(`Checksum mismatch (calculated: ${sum & 0xFF}, tape: ${checksum})`);
                            }
                        }
                    }
                }
                
                if ((dataLength <= 0) || (dataLength <= 3 && bytes[0] === bytes[2] && bytes[1] === bytes[3] && !programData)) {
                    // Try alternative interpretation - maybe the addresses are wrong
                    console.log('Data length <= 0, trying alternative Apple I format interpretation...');
                    
                    // Special case: Check if we have duplicated start address (08 02 08 02)
                    if (bytes[0] === bytes[2] && bytes[1] === bytes[3]) {
                        console.log('Detected duplicated start address, trying different interpretations...');
                        
                        // Try interpretation: start addr + end addr starting at byte 4
                        const altStart = bytes[4] | (bytes[5] << 8);
                        const altEnd = bytes[6] | (bytes[7] << 8);
                        const altLength = altEnd - altStart + 1;
                        
                        if (altLength > 0 && altLength < 4096 && altStart >= 0x200 && altStart < 0x8000) {
                            console.log(`Alt interpretation 1: Start=$${altStart.toString(16).toUpperCase()}, End=$${altEnd.toString(16).toUpperCase()}, Length=${altLength}`);
                            if (altLength <= bytes.length - 8) {
                                startAddr = altStart;
                                endAddr = altEnd;
                                programData = bytes.slice(8, 8 + altLength);
                                console.log(`Using alt interpretation 1 with ${programData.length} bytes`);
                            }
                        }
                        
                        // Try interpretation: use first addr as start, look for reasonable end addr
                        if (!programData) {
                            const firstAddr = bytes[0] | (bytes[1] << 8);
                            // Try using a reasonable program size (e.g., rest of available data)
                            const availableData = Math.min(1024, bytes.length - 4); // Max 1KB program
                            console.log(`Alt interpretation 2: Start=$${firstAddr.toString(16).toUpperCase()}, assuming ${availableData} bytes of data`);
                            
                            startAddr = firstAddr;
                            endAddr = firstAddr + availableData - 1;
                            programData = bytes.slice(4, 4 + availableData);
                            console.log(`Using alt interpretation 2 with ${programData.length} bytes`);
                        }
                    } else {
                        // Look for different address patterns in the first 16 bytes
                        for (let offset = 0; offset < 8; offset += 2) {
                            const altStart = bytes[offset] | (bytes[offset + 1] << 8);
                            const altEnd = bytes[offset + 2] | (bytes[offset + 3] << 8);
                            const altLength = altEnd - altStart + 1;
                            
                            if (altLength > 0 && altLength < 4096 && altStart >= 0x200 && altStart < 0x8000) {
                                console.log(`Alternative ${offset/2}: Start=$${altStart.toString(16).toUpperCase()}, End=$${altEnd.toString(16).toUpperCase()}, Length=${altLength}`);
                                
                                if (altLength <= bytes.length - offset - 4) {
                                    startAddr = altStart;
                                    endAddr = altEnd;
                                    programData = bytes.slice(offset + 4, offset + 4 + altLength);
                                    console.log(`Using alternative format ${offset/2} with ${programData.length} bytes`);
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (!programData) {
                        throw new Error(`Invalid Apple I format: data length ${dataLength} doesn't match available bytes`);
                    }
                } else {
                    throw new Error(`Invalid Apple I format: data length ${dataLength} doesn't match available bytes`);
                }
            } else {
                // Treat as raw program data
                console.log('Treating as raw program data');
                startAddr = 0x0300; // Default Apple I program start
                programData = bytes;
                endAddr = startAddr + programData.length - 1;
            }
            
            if (!programData || programData.length === 0) {
                throw new Error("No program data extracted from Apple I tape.");
            }
            
            // Analyze program content
            const validOpcodes = new Set(Object.keys(cpu.instructions).map(k => parseInt(k)));
            let validInstructions = 0;
            const sampleSize = Math.min(32, programData.length);
            
            for (let i = 0; i < sampleSize; i++) {
                if (validOpcodes.has(programData[i])) {
                    validInstructions++;
                }
            }
            
            const codeConfidence = validInstructions / sampleSize;
            console.log(`Code analysis: ${validInstructions}/${sampleSize} valid opcodes (${(codeConfidence * 100).toFixed(1)}% confidence)`);
            
            // Load into Apple I memory
            programData.forEach((byte, index) => {
                write(startAddr + index, byte);
            });
            
            // Debug: Show what was actually loaded into memory
            console.log(`\nMemory dump at load address $${startAddr.toString(16).toUpperCase()}:`);
            for (let i = 0; i < Math.min(64, programData.length); i += 16) {
                let line = `$${(startAddr + i).toString(16).toUpperCase().padStart(4, '0')}: `;
                let ascii = '';
                for (let j = 0; j < 16 && i + j < programData.length; j++) {
                    const byte = programData[i + j];
                    line += byte.toString(16).toUpperCase().padStart(2, '0') + ' ';
                    ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
                }
                console.log(line.padEnd(52) + '| ' + ascii);
            }
            
            let message;
            // Be more lenient for valid Apple I format programs
            const confidenceThreshold = bestResult.validAppleI ? 0.2 : 0.3;
            
            if (codeConfidence > confidenceThreshold) {
                // High confidence - likely executable code
                message = `Apple I program loaded: ${programData.length} bytes from $${startAddr.toString(16).toUpperCase()} to $${endAddr.toString(16).toUpperCase()}. Type "${startAddr.toString(16).toUpperCase()}R" to run.`;
                console.log('Loaded as executable Apple I program');
                // Don't set data protection for executable code
            } else {
                // Lower confidence - might be data
                // Low confidence - could be data or imperfect code dump
                console.log(`Low code confidence (${(codeConfidence * 100).toFixed(1)}%) - use Ctrl+Shift+R to force run as code if needed.`);
                message = `Loaded ${programData.length} bytes (${(codeConfidence * 100).toFixed(1)}% code confidence) from $${startAddr.toString(16).toUpperCase()} to $${endAddr.toString(16).toUpperCase()}. Use "${startAddr.toString(16).toUpperCase()}.${endAddr.toString(16).toUpperCase()}" to examine, or Ctrl+Shift+R to force run.`;
                
                // Only protect low-confidence data from accidental execution
                dataLoadedAt = { start: startAddr, end: endAddr };
                
                // Reset CPU back to Wozmon since this is likely data, not code
                console.log('Resetting CPU to Wozmon. Use Ctrl+Shift+R if this should be executable code.');
                cpu.pc = 0xFF00; // Reset to Wozmon entry point
                cpu.sp = 0xFF;   // Reset stack pointer
                lastPc = 0xFF00; // Reset stuck detection
                stuckCount = 0;
                
                // Try to display as text if it contains printable characters
                let textContent = '';
                let printableCount = 0;
                for (let i = 0; i < Math.min(100, programData.length); i++) {
                    const byte = programData[i] & 0x7F; // Strip high bit
                    if (byte >= 0x20 && byte <= 0x7E) { // Printable ASCII
                        textContent += String.fromCharCode(byte);
                        printableCount++;
                    } else if (byte === 0x0D || byte === 0x0A) { // CR/LF
                        textContent += '\n';
                    } else {
                        textContent += '.';
                    }
                }
                
                if (printableCount > programData.length * 0.3) { // If >30% printable
                    console.log('Data appears to contain text:');
                    console.log(textContent.substring(0, 200));
                }
            }
            
            showFinalStatus(message);

        } catch (error) {
            showFinalStatus(`Apple I cassette error: ${error.message}`, true);
            console.error('Apple I cassette loading failed:', error);
        }
    }
    
    // Apple I specific format decoder
    function decodeAppleIFormat(bits, startPos, format, sampleRate) {
        const bytes = [];
        let pos = startPos;
        let errors = 0;
        let validBytes = 0;
        
        const frameSize = format.startBits + format.dataBits + format.stopBits;
        
        while (pos + frameSize <= bits.length && bytes.length < 2048) {
            let valid = true;
            
            // Check start bit(s) if required
            if (format.expectStart !== null) {
                for (let i = 0; i < format.startBits; i++) {
                    if (bits[pos + i] !== format.expectStart) {
                        valid = false;
                        break;
                    }
                }
            }
            
            if (!valid) {
                pos++;
                errors++;
                continue;
            }
            
            // Extract data bits (LSB first for Apple I)
            let byte = 0;
            for (let i = 0; i < format.dataBits; i++) {
                if (bits[pos + format.startBits + i] === 1) {
                    byte |= (1 << i);
                }
            }
            
            // Check stop bit(s) if required
            if (format.expectStop !== null) {
                for (let i = 0; i < format.stopBits; i++) {
                    if (bits[pos + format.startBits + format.dataBits + i] !== format.expectStop) {
                        valid = false;
                        break;
                    }
                }
            }
            
            if (valid) {
                bytes.push(byte);
                validBytes++;
                pos += frameSize;
            } else {
                pos++;
                errors++;
            }
            
            // Stop if we're getting too many errors
            if (errors > validBytes * 2 && bytes.length > 10) break;
        }
        
        // Analyze if this looks like valid Apple I format
        let validAppleI = false;
        let hasValidCode = false;
        
        if (bytes.length >= 4) {
            const addr1 = bytes[0] | (bytes[1] << 8);
            const addr2 = bytes[2] | (bytes[3] << 8);
            
            // Apple I addresses typically in range $0200-$8000
            validAppleI = (addr1 >= 0x0200 && addr1 < 0x8000 && 
                          addr2 >= addr1 && addr2 < 0x8000 && 
                          (addr2 - addr1) < 4096);
            
            if (validAppleI && bytes.length >= addr2 - addr1 + 5) {
                // Check if program data contains valid 6502 opcodes
                const programStart = 4;
                const programLength = Math.min(32, addr2 - addr1 + 1);
                let validOpcodes = 0;
                
                for (let i = 0; i < programLength; i++) {
                    const opcode = bytes[programStart + i];
                    if (cpu.instructions[opcode]) {
                        validOpcodes++;
                    }
                }
                
                hasValidCode = validOpcodes / programLength > 0.3;
            }
        }
        
        return {
            bytes: bytes,
            format: format,
            validAppleI: validAppleI,
            hasValidCode: hasValidCode,
            errors: errors,
            validBytes: validBytes
        };
    }

    let lastPc = 0;
    let stuckCount = 0;
    let debugMode = true;
    let executionEnabled = true;
    let dataLoadedAt = null;

    // Helper function to get instruction name for debugging
    function getInstructionName(opcode) {
        const opcodeMap = {
            0xFE: 'INC abs,X', 0xEE: 'INC abs', 0xE6: 'INC zp', 0xF6: 'INC zp,X',
            0xDE: 'DEC abs,X', 0xCE: 'DEC abs', 0xC6: 'DEC zp', 0xD6: 'DEC zp,X',
            0x4C: 'JMP abs', 0x6C: 'JMP (abs)', 0x20: 'JSR abs', 0x60: 'RTS',
            0xA9: 'LDA #', 0xAD: 'LDA abs', 0xA5: 'LDA zp', 0xB5: 'LDA zp,X',
            0x8D: 'STA abs', 0x85: 'STA zp', 0x95: 'STA zp,X',
            0x00: 'BRK', 0xEA: 'NOP', 0x40: 'RTI',
            0x82: 'NOP #(illegal)', 0x89: 'NOP #(illegal)', 0xC2: 'NOP #(illegal)', 0xE2: 'NOP #(illegal)',
            0xB0: 'BCS', 0xB2: 'NOP(illegal)', 0x90: 'BCC', 0xF0: 'BEQ', 0xD0: 'BNE'
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
                            
                            // Fix corrupted IRQ vector
                            ram[0xFFFE] = 0x00;  // Low byte of $FF00 (Wozmon entry)
                            ram[0xFFFF] = 0xFF;  // High byte of $FF00
                            
                            console.log('System reset complete. The loaded cassette data is not valid 6502 executable code.');
                            break; // Exit the execution loop for this cycle
                        }
                    }
                    
                    // Prevent execution of loaded data (but allow if explicitly started with R command)
                    if (dataLoadedAt && cpu.pc >= dataLoadedAt.start && cpu.pc <= dataLoadedAt.end) {
                        console.log(`Data protection triggered at $${cpu.pc.toString(16).toUpperCase()}`);
                        console.log(`Data protection area: $${dataLoadedAt.start.toString(16).toUpperCase()}-$${dataLoadedAt.end.toString(16).toUpperCase()}`);
                        console.log('Use Ctrl+Shift+R to force execution, or this may be accidental execution of data');
                        cpu.pc = 0xFF00; // Jump back to Wozmon
                        dataLoadedAt = null; // Clear the protection
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
        tapeButton.addEventListener('click', () => tapeFileInput.click());
        tapeFileInput.addEventListener('change', loadFromCassette);

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