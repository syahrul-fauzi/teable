/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { IFieldVo, IRecord } from '@teable-group/core';
import { FieldKeyType, FieldType, nullsToUndefined } from '@teable-group/core';
import { PrismaService } from '../../prisma.service';
import { TransactionService } from '../../share-db/transaction.service';
import { FieldService } from '../field/field.service';
import type { IFieldInstance } from '../field/model/factory';
import { createFieldInstanceByRo } from '../field/model/factory';
import { FieldOpenApiService } from '../field/open-api/field-open-api.service';
import { RecordOpenApiService } from '../record/open-api/record-open-api.service';
import { RecordService } from '../record/record.service';
import { SelectionModule } from './selection.module';
import { SelectionService } from './selection.service';

describe('selectionService', () => {
  let selectionService: SelectionService;
  let recordService: RecordService;
  let fieldService: FieldService;
  let prismaService: PrismaService;
  let recordOpenApiService: RecordOpenApiService;
  let fieldOpenApiService: FieldOpenApiService;
  let transactionService: TransactionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [SelectionModule, EventEmitterModule.forRoot()],
    })
      .overrideProvider(PrismaService)
      .useValue({
        attachments: {
          findMany: jest.fn(),
        },
      })
      .compile();

    selectionService = module.get<SelectionService>(SelectionService);
    fieldService = module.get<FieldService>(FieldService);
    recordService = module.get<RecordService>(RecordService);
    prismaService = module.get<PrismaService>(PrismaService);
    recordOpenApiService = module.get<RecordOpenApiService>(RecordOpenApiService);
    fieldOpenApiService = module.get<FieldOpenApiService>(FieldOpenApiService);
    transactionService = module.get<TransactionService>(TransactionService);
  });

  const tableId = 'table1';
  const viewId = 'view1';

  describe('copy', () => {
    const range = '[[0, 0], [1, 1]]';

    it('should return merged ranges data', async () => {
      const mockSelectionCtxRecords = [
        {
          id: 'record1',
          recordOrder: {},
          fields: {
            field1: '1',
            field2: '2',
            field3: '3',
          },
        },
        {
          id: 'record2',
          recordOrder: {},
          fields: {
            field1: '1',
            field2: '2',
          },
        },
      ];
      const mockSelectionCtxFields = [
        { id: 'field1', name: 'Field 1', type: FieldType.SingleLineText },
        { id: 'field2', name: 'Field 2', type: FieldType.SingleLineText },
      ];
      jest.spyOn(selectionService as any, 'getSelectionCtxByRange').mockReturnValue({
        records: mockSelectionCtxRecords,
        fields: mockSelectionCtxFields,
      });

      const result = await selectionService.copy(tableId, viewId, {
        ranges: range,
      });

      expect(result?.content).toEqual('1\t2\n1\t2');
    });
  });

  describe('parseCopyContent', () => {
    it('should parse the copy content into a 2D array', () => {
      // Input
      const content = 'John\tDoe\tjohn.doe@example.com\nJane\tSmith\tjane.smith@example.com';
      const expectedParsedContent = [
        ['John', 'Doe', 'john.doe@example.com'],
        ['Jane', 'Smith', 'jane.smith@example.com'],
      ];

      // Perform the parsing
      const result = selectionService['parseCopyContent'](content);

      // Verify the result
      expect(result).toEqual(expectedParsedContent);
    });
  });

  describe('calculateExpansion', () => {
    it('should calculate the number of rows and columns to expand', () => {
      // Input
      const tableSize: [number, number] = [5, 4];
      const cell: [number, number] = [2, 3];
      const tableDataSize: [number, number] = [2, 2];
      const expectedExpansion = [0, 1];

      // Perform the calculation
      const result = selectionService['calculateExpansion'](tableSize, cell, tableDataSize);

      // Verify the result
      expect(result).toEqual(expectedExpansion);
    });
  });

  describe('expandRows', () => {
    it('should expand the rows and create new records', async () => {
      // Mock dependencies
      const tableId = 'table1';
      const numRowsToExpand = 3;
      const transactionKey = 'transactionKey';
      const expectedRecords = [
        { id: 'record1', fields: {} },
        { id: 'record2', fields: {} },
      ] as IRecord[];
      jest.spyOn(recordOpenApiService, 'multipleCreateRecords').mockResolvedValueOnce({
        records: expectedRecords,
      });

      // Perform expanding rows
      const result = await selectionService['expandRows']({
        tableId,
        numRowsToExpand,
        transactionKey,
      });

      // Verify the multipleCreateRecords call
      expect(recordOpenApiService.multipleCreateRecords).toHaveBeenCalledTimes(1);
      expect(recordOpenApiService.multipleCreateRecords).toHaveBeenCalledWith(
        tableId,
        { records: Array.from({ length: numRowsToExpand }, () => ({ fields: {} })) },
        transactionKey
      );

      // Verify the result
      expect(result).toEqual({ records: expectedRecords });
    });
  });

  describe('expandColumns', () => {
    it('should expand the columns and create new fields', async () => {
      // Mock dependencies
      const tableId = 'table1';
      const viewId = 'view1';
      const header = [
        { id: '3', name: 'Email', type: FieldType.SingleLineText },
        { id: '4', name: 'Phone', type: FieldType.SingleLineText },
      ] as IFieldVo[];
      const numColsToExpand = 2;
      const transactionKey = 'transactionKey';
      jest.spyOn(fieldOpenApiService, 'createField').mockResolvedValueOnce(header[0]);
      jest.spyOn(fieldOpenApiService, 'createField').mockResolvedValueOnce(header[1]);

      // Perform expanding columns
      const result = await selectionService['expandColumns']({
        tableId,
        viewId,
        header,
        numColsToExpand,
        transactionKey,
      });

      // Verify the createField calls
      expect(fieldOpenApiService.createField).toHaveBeenCalledTimes(2);

      // Verify the result
      expect(result.length).toEqual(2);
    });
  });

  describe('collectionAttachment', () => {
    it('should return attachments based on tokens', async () => {
      const fields: IFieldInstance[] = [
        createFieldInstanceByRo({ id: '1', name: 'attachments', type: FieldType.Attachment }),
      ];
      const tableData: string[][] = [
        ['file1.png (https://xxx.xxx/token1),file2.png (https://xxx.xxx/token2)'],
        ['file3.png (https://xxx.xxx/token3)'],
      ];

      const mockAttachment = [
        {
          token: 'token1',
          path: '',
          url: '',
          size: 1,
          mimetype: 'image/png',
          width: undefined,
          height: undefined,
        },
        {
          token: 'token2',
          path: '',
          url: '',
          size: 1,
          mimetype: 'image/png',
          width: 10,
          height: 10,
        },
        {
          token: 'token3',
          path: '',
          url: '',
          size: 1,
          mimetype: 'image/png',
          width: 10,
          height: 10,
        },
      ];

      (prismaService.attachments.findMany as jest.Mock).mockResolvedValue(mockAttachment);
      const result = await selectionService['collectionAttachment']({
        tableData,
        fields,
      });

      expect(prismaService.attachments.findMany).toHaveBeenCalledWith({
        where: {
          token: {
            in: ['token1', 'token2', 'token3'],
          },
        },
        select: {
          token: true,
          size: true,
          mimetype: true,
          width: true,
          height: true,
          path: true,
          url: true,
        },
      });
      // Assert the result based on the mocked attachments
      expect(result).toEqual(nullsToUndefined(mockAttachment));
    });
  });

  describe('fillCells', () => {
    it('should fill the cells with provided table data', async () => {
      // Mock data
      const tableData = [
        ['A1', 'B1', 'C1'],
        ['A2', 'B2', 'C2'],
        ['A3', 'B3', 'C3'],
      ];

      const fields = [
        { id: 'field1', name: 'Field 1', type: FieldType.SingleLineText },
        { id: 'field2', name: 'Field 2', type: FieldType.SingleLineText },
        { id: 'field3', name: 'Field 3', type: FieldType.SingleLineText },
      ].map(createFieldInstanceByRo);

      const records = [
        { id: 'record1', recordOrder: {}, fields: {} },
        { id: 'record2', recordOrder: {}, fields: {} },
        { id: 'record3', recordOrder: {}, fields: {} },
      ];

      // Execute the method
      const updateRecordsRo = await selectionService['fillCells']({
        tableData,
        fields,
        records,
      });

      expect(updateRecordsRo).toEqual([
        {
          recordId: records[0].id,
          record: {
            fields: { field1: 'A1', field2: 'B1', field3: 'C1' },
          },
          fieldKeyType: FieldKeyType.Id,
        },
        {
          recordId: records[1].id,
          record: {
            fields: { field1: 'A2', field2: 'B2', field3: 'C2' },
          },
          fieldKeyType: FieldKeyType.Id,
        },
        {
          recordId: records[2].id,
          record: {
            fields: { field1: 'A3', field2: 'B3', field3: 'C3' },
          },
          fieldKeyType: FieldKeyType.Id,
        },
      ]);
    });
  });

  describe('paste', () => {
    const content = 'A1\tB1\tC1\nA2\tB2\tC2\nA3\tB3\tC3';
    const tableData = [
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2'],
      ['A3', 'B3', 'C3'],
    ];
    const testTransactionKey = 'testTransactionKey';

    it('should paste table data and update records', async () => {
      // Mock input parameters
      const tableId = 'testTableId';
      const viewId = 'testViewId';

      // Mock dependencies
      const mockFields = [
        { id: 'fieldId1', name: 'Field 1', type: FieldType.SingleLineText },
        { id: 'fieldId2', name: 'Field 2', type: FieldType.SingleLineText },
        { id: 'fieldId3', name: 'Field 3', type: FieldType.SingleLineText },
      ].map(createFieldInstanceByRo);

      const pasteRo = {
        cell: [2, 1] as [number, number],
        content,
        header: mockFields,
      };

      const mockRecords = [
        { id: 'recordId1', recordOrder: {}, fields: {} },
        { id: 'recordId2', recordOrder: {}, fields: {} },
      ];

      const mockNewFields = [
        { id: 'newFieldId1', name: 'Field 1', type: FieldType.SingleLineText },
        { id: 'newFieldId2', name: 'Field 2', type: FieldType.SingleLineText },
      ].map(createFieldInstanceByRo);

      const mockNewRecords = [
        { id: 'newRecordId1', recordOrder: {}, fields: {} },
        { id: 'newRecordId2', recordOrder: {}, fields: {} },
      ];

      jest.spyOn(selectionService as any, 'parseCopyContent').mockReturnValue(tableData);

      jest.spyOn(recordService, 'getRowCount').mockResolvedValue(mockRecords.length);
      jest.spyOn(recordService, 'getRecords').mockResolvedValue({
        records: mockRecords.slice(pasteRo.cell[1]),
        total: mockRecords.length,
      });

      jest.spyOn(fieldService, 'getFieldInstances').mockResolvedValue(mockFields);

      jest.spyOn(selectionService as any, 'expandRows').mockResolvedValue({
        records: mockNewRecords,
      });
      jest.spyOn(selectionService as any, 'expandColumns').mockResolvedValue(mockNewFields);
      jest.spyOn(transactionService, '$transaction').mockImplementation(async (_, callback) => {
        await callback(prismaService, testTransactionKey);
      });

      jest.spyOn(recordOpenApiService, 'updateRecords').mockResolvedValue(null as any);

      // Call the method
      const result = await selectionService.paste(tableId, viewId, pasteRo);

      // Assertions
      expect(selectionService['parseCopyContent']).toHaveBeenCalledWith(content);
      expect(recordService.getRowCount).toHaveBeenCalledWith(prismaService, tableId, viewId);
      expect(recordService.getRecords).toHaveBeenCalledWith(tableId, {
        viewId,
        skip: 1,
        take: tableData.length,
        fieldKeyType: 'id',
      });

      expect(fieldService.getFieldInstances).toHaveBeenCalledWith(tableId, { viewId });

      expect(selectionService['expandColumns']).toHaveBeenCalledWith({
        tableId,
        viewId,
        header: mockFields,
        numColsToExpand: 2,
        transactionKey: testTransactionKey,
      });

      expect(selectionService['expandRows']).toHaveBeenCalledWith({
        tableId,
        numRowsToExpand: 2,
        transactionKey: testTransactionKey,
      });

      expect(result).toEqual([
        [2, 1],
        [4, 3],
      ]);
    });
  });

  describe('clear', () => {
    const tableId = 'testTableId';
    const viewId = 'testViewId';
    const records = [
      {
        id: 'record1',
        recordOrder: {},
        fields: {
          field1: '1',
          field2: '2',
        },
      },
    ];
    const fields = [
      { id: 'field1', name: 'Field 1', type: FieldType.SingleLineText },
      { id: 'field2', name: 'Field 2', type: FieldType.SingleLineText },
    ];

    it('should clear both fields and records when type is undefined', async () => {
      // Mock the required dependencies and their methods
      const clearRo = {
        ranges: [
          [0, 0],
          [0, 0],
        ] as [number, number][],
      };
      const updateRecordsRo = {}; // Mock the updateRecordsRo object

      // Mock the required methods from the service
      selectionService['getSelectionCtxByRange'] = jest.fn().mockResolvedValue({ fields, records });
      selectionService['fillCells'] = jest.fn().mockResolvedValue(updateRecordsRo);
      recordOpenApiService.updateRecords = jest.fn().mockResolvedValue(null);

      // Call the clear method
      await selectionService.clear(tableId, viewId, clearRo);

      // Expect the methods to have been called with the correct parameters
      expect(selectionService['getSelectionCtxByRange']).toHaveBeenCalledWith(
        tableId,
        viewId,
        clearRo.ranges,
        undefined
      );
      expect(selectionService['fillCells']).toHaveBeenCalledWith({
        tableData: [],
        fields,
        records,
      });
      expect(recordOpenApiService.updateRecords).toHaveBeenCalledWith(tableId, updateRecordsRo);
    });
  });
});