from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional


class PortDirection(str, Enum):
    INPUT = "input"
    OUTPUT = "output"
    INOUT = "inout"

class SignalType(str, Enum):
    WIRE = "wire"
    REG = "reg"

class ModuleCategory(str, Enum):
    COMBINATIONAL = "combinational"
    SEQUENTIAL = "sequential"
    MEMORY = "memory"
    INTERFACE = "interface"
    ARITHMETIC = "arithmetic"
    CONTROL = "control"
    CUSTOM = "custom"

class DesignComplexity(str, Enum):
    TRIVIAL = "trivial"
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


class Port(BaseModel):
    name: str
    direction: PortDirection
    width: int = Field(default=1, ge=1)
    signal_type: SignalType = Field(default=SignalType.WIRE)
    description: str = Field(default="")
    is_clock: bool = False
    is_reset: bool = False

class Operation(BaseModel):
    name: str
    opcode: Optional[str] = None
    behavior: Optional[str] = None
    description: str = Field(default="")

class TestVector(BaseModel):
    name: str
    inputs: dict[str, str]
    expected_outputs: dict[str, str]
    description: str = Field(default="")

class Connection(BaseModel):
    from_module: str
    from_port: str
    to_module: str
    to_port: str
    width: int = Field(default=1)


class ModuleSpec(BaseModel):
    name: str
    category: ModuleCategory
    description: str
    ports: list[Port] = Field(default_factory=list)
    operations: list[Operation] = Field(default_factory=list)
    test_vectors: list[TestVector] = Field(default_factory=list)
    parameters: dict[str, str] = Field(default_factory=dict)
    clock_edge: Optional[str] = None
    has_async_reset: bool = False
    states: list[str] = Field(default_factory=list)
    initial_state: Optional[str] = None


class DesignSpec(BaseModel):
    name: str
    description: str
    original_prompt: str
    top_module: str
    modules: list[ModuleSpec]
    connections: list[Connection] = Field(default_factory=list)
    complexity: DesignComplexity = Field(default=DesignComplexity.SIMPLE)
    target_clock_mhz: Optional[float] = None
    target_technology: str = Field(default="sky130")
    version: str = Field(default="1.0")


class SynthesisResult(BaseModel):
    success: bool
    gate_count: Optional[int] = None
    area_um2: Optional[float] = None
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    log: str = Field(default="")

class SimulationResult(BaseModel):
    success: bool
    tests_total: int = 0
    tests_passed: int = 0
    tests_failed: int = 0
    failures: list[dict] = Field(default_factory=list)
    log: str = Field(default="")


EXAMPLE_ALU = DesignSpec(
    name="alu_4bit",
    description="4-bit ALU supporting add, subtract, AND, OR",
    original_prompt="Design a 4-bit ALU with add, subtract, AND, OR",
    top_module="alu",
    complexity=DesignComplexity.SIMPLE,
    modules=[
        ModuleSpec(
            name="alu",
            category=ModuleCategory.COMBINATIONAL,
            description="4-bit ALU with 4 operations selected by 2-bit opcode",
            ports=[
                Port(name="a", direction=PortDirection.INPUT, width=4, description="First operand"),
                Port(name="b", direction=PortDirection.INPUT, width=4, description="Second operand"),
                Port(name="op", direction=PortDirection.INPUT, width=2, description="Operation select"),
                Port(name="result", direction=PortDirection.OUTPUT, width=4, signal_type=SignalType.REG, description="Result"),
                Port(name="carry_out", direction=PortDirection.OUTPUT, width=1, signal_type=SignalType.REG, description="Carry"),
                Port(name="zero_flag", direction=PortDirection.OUTPUT, width=1, description="High when result is 0"),
            ],
            operations=[
                Operation(name="ADD", opcode="2'b00", behavior="result = a + b", description="Addition"),
                Operation(name="SUB", opcode="2'b01", behavior="result = a - b", description="Subtraction"),
                Operation(name="AND", opcode="2'b10", behavior="result = a & b", description="Bitwise AND"),
                Operation(name="OR",  opcode="2'b11", behavior="result = a | b", description="Bitwise OR"),
            ],
            test_vectors=[
                TestVector(name="add_3_plus_5", inputs={"a": "4'd3", "b": "4'd5", "op": "2'b00"}, expected_outputs={"result": "4'd8", "carry_out": "1'b0"}, description="3 + 5 = 8"),
                TestVector(name="add_overflow", inputs={"a": "4'd15", "b": "4'd1", "op": "2'b00"}, expected_outputs={"result": "4'd0", "carry_out": "1'b1"}, description="15 + 1 overflows"),
                TestVector(name="sub_7_minus_2", inputs={"a": "4'd7", "b": "4'd2", "op": "2'b01"}, expected_outputs={"result": "4'd5"}, description="7 - 2 = 5"),
                TestVector(name="and_op", inputs={"a": "4'b1100", "b": "4'b1010", "op": "2'b10"}, expected_outputs={"result": "4'b1000"}, description="1100 AND 1010 = 1000"),
                TestVector(name="or_op", inputs={"a": "4'b1100", "b": "4'b1010", "op": "2'b11"}, expected_outputs={"result": "4'b1110"}, description="1100 OR 1010 = 1110"),
                TestVector(name="zero_flag", inputs={"a": "4'd0", "b": "4'd0", "op": "2'b00"}, expected_outputs={"result": "4'd0", "zero_flag": "1'b1"}, description="0 + 0, zero flag high"),
            ],
            parameters={"WIDTH": "4"},
        )
    ],
)


if __name__ == "__main__":
    import json
    print("=" * 50)
    print("  VOLTA — Schema Test")
    print("=" * 50)
    print()
    spec_json = EXAMPLE_ALU.model_dump()
    print(json.dumps(spec_json, indent=2))
    print()
    print(f"✓ Design: {EXAMPLE_ALU.name}")
    print(f"✓ Modules: {len(EXAMPLE_ALU.modules)}")
    print(f"✓ Ports: {len(EXAMPLE_ALU.modules[0].ports)}")
    print(f"✓ Operations: {len(EXAMPLE_ALU.modules[0].operations)}")
    print(f"✓ Test vectors: {len(EXAMPLE_ALU.modules[0].test_vectors)}")
    print(f"✓ Target: {EXAMPLE_ALU.target_technology}")
    print()
    print("Schema is valid. This is your foundation.")
