// Sample texts for trying the detector. From the HC3 dataset (Guo et al., 2023,
// "How Close is ChatGPT to Human Experts?"), licensed CC BY-SA 4.0. These answers are
// from the held-out test split, not the part used to set the thresholds.

export interface Sample {
  id: "human" | "ai" | "mixed";
  label: string;
  description: string;
  text: string;
}

export const SAMPLES: Sample[] = [
  {
    "id": "human",
    "label": "Human-written",
    "description": "A Reddit answer explaining what an orchestra conductor does.",
    "text": "Orchestra musician here. The conductor of an orchestra usually stands at the front of the orchestra and keeps the time of the piece which the orchestra is performing by waving their hand with the tempo of the piece. That way, the musicians can watch the conductor and always know what beat of the measure they are on, this isn't always necessary, but on tricky pieces it becomes very helpful. The conductor also stands to conduct fermatas. A fermata is when a note is held out as long as the conductor likes it to be. (Think of the ending of a loud orchestral soundtrack where the last note is held out a really long time. That is the conductor telling the orchestra to hold the note until they out their hands down.) the conductor also tells the orchestra what to do with dynamics; loud and quiet, soft or impactful. Also, it is kind of a visual thing to see a conductor in front of a performing orchestra. Not completely necessary, but it looks better. And to answer your other question, depending on the skill level of the orchestra and the difficulty of their piece of music, a good orchestra would not sound significantly different without a conductor except on fermatas where every musician would have to listen to when the other musicians ended their held out notes. Hope this answers your question! Edit: words."
  },
  {
    "id": "ai",
    "label": "AI-generated",
    "description": "A ChatGPT answer about keeping paper copies of business records.",
    "text": "In general, it is a good idea to keep physical copies of important documents for your business, in addition to electronic copies. Physical copies can serve as backups in case something happens to your electronic copies, such as a computer crash or data loss. There may also be legal or regulatory requirements for your business to keep certain records in physical form. For example, some jurisdictions may require businesses to keep physical copies of certain documents, such as contracts or financial records, for a certain number of years. It is important to check with your local government or regulatory agency to determine what requirements apply to your business. In addition to any legal or regulatory requirements, it can also be helpful to have physical copies of documents on hand for reference and easy access. For example, you may want to keep copies of contracts, invoices, and other important documents in a filing cabinet or other secure location for easy access when you need them. Overall, it is a good idea to have a system in place for storing and organizing both physical and electronic copies of important documents for your business. This can help you stay organized and ensure that you have access to important information when you need it."
  },
  {
    "id": "mixed",
    "label": "Mixed",
    "description": "Two human paragraphs with a ChatGPT answer in between.",
    "text": "The view in many companies is that customer support / tech support is a money pit. Call centers like these generate very little money, regardless of quality. This makes sense if you think about it. Call center quality is going to have very little effect on the purchasing decisions of the average consumer.\n\nThere are a few reasons why companies might hire foreign people to do technical or customer support. One reason is that it can be less expensive to hire workers in other countries, especially if the cost of living is lower there. For example, if a company is based in a country with a high cost of living, it might be able to save money by hiring workers in a country with a lower cost of living. \nAnother reason is that there may be a shortage of qualified candidates in the company's home country, or the company may have difficulty finding people with the necessary skills or experience. In these cases, the company may look to other countries to find the talent it needs. \nWhile it's true that language barriers can sometimes be a challenge when working with foreign technical or customer support staff, many companies provide language training or hire staff who are fluent in the language used by their customers. Additionally, advances in technology, such as translation software, can also help to bridge language gaps. \nOverall, companies hire foreign workers for technical or customer support for a variety of reasons, including cost savings and access to a larger pool of qualified candidates. While there can be challenges, many companies have found ways to successfully work with foreign staff and provide high-quality support to their customers.\n\nSo companies have a choice, outsource all call center services to another company or try to build a very expensive call center from scratch. Many companies choose to go the easy route and outsource their call centers entirely. For some companies, this just means hiring another company here in the same country to handle it. For more and more companies, India has the cheapest call centers for hire."
  }
];

export const SAMPLES_CREDIT = "Samples from the HC3 dataset (CC BY-SA 4.0).";
